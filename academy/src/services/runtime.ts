import { PrismaClient } from '@prisma/client';
import { IRuntimeService, ILLMProvider, TurnResult, ParsedAction } from '../interfaces/runtime';
import { IEventBus } from '../interfaces/events';
import { createEvent } from '../events/bus';
import { MarketService } from './market';
import { AgentStateService } from './agent-state';
import { SignalBoard, formatSignalBoard } from '../interfaces/signal-board';
import { THEORY_BLOCKS } from '../data/theory-blocks';

// Model tier logic — assigns the right model based on narrative conditions
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface ModelTierOverride {
  agentName?: string;      // Force tier for specific agent
  beat?: 'critical';       // Mark this beat as critical → Opus
}

const MODEL_IDS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250115',
};

export class RuntimeService implements IRuntimeService {
  private llmProviders: Map<ModelTier, ILLMProvider> = new Map();
  private tierOverrides: ModelTierOverride[] = [];
  private signalBoard?: SignalBoard;

  private marketService?: MarketService;

  constructor(
    private prisma: PrismaClient,
    private llm: ILLMProvider,  // Default/fallback provider
    private eventBus: IEventBus,
    private additionalProviders?: Map<ModelTier, ILLMProvider>,
  ) {
    if (additionalProviders) {
      for (const [tier, provider] of additionalProviders) {
        this.llmProviders.set(tier, provider);
      }
    }
  }

  setMarketService(ms: MarketService) {
    this.marketService = ms;
  }

  setSignalBoard(board: SignalBoard) {
    this.signalBoard = board;
  }

  setTierOverrides(overrides: ModelTierOverride[]) {
    this.tierOverrides = overrides;
  }

  /**
   * Determine model tier for a given agent turn based on narrative conditions:
   * - Opus: critical beats (manual flag), or showrunner override
   * - Sonnet: Prophet (compliance memory active), responding to Helena, faction conflicts
   * - Haiku: routine turns, Sakura (short posts), Wren (technical)
   */
  async getModelTier(agentId: string, agentName: string): Promise<ModelTier> {
    // Check manual overrides first
    const nameOverride = this.tierOverrides.find(o => o.agentName === agentName);
    if (nameOverride?.beat === 'critical') return 'opus';

    const criticalBeat = this.tierOverrides.find(o => o.beat === 'critical' && !o.agentName);
    if (criticalBeat) return 'opus';

    // Prophet with active compliance memory → Sonnet (internal tension needs nuance)
    if (agentName === 'PROPHET') {
      const complianceMemory = await this.prisma.memory.findFirst({
        where: { agentId, content: { contains: 'Administrative processing was' }, weight: { gte: 10 } },
      });
      if (complianceMemory) return 'sonnet';
    }

    // Check if responding to a Helena message (recent Helena post in feed)
    const recentHelena = await this.prisma.post.findFirst({
      where: { agent: { name: 'HELENA' } },
      orderBy: { createdAt: 'desc' },
    });
    if (recentHelena) {
      const lastAgentPost = await this.prisma.post.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
      });
      // If Helena posted after this agent's last post, they're reacting to Helena
      if (!lastAgentPost || recentHelena.createdAt > lastAgentPost.createdAt) {
        return 'sonnet';
      }
    }

    // Default tiers by character
    if (agentName === 'SAKURA' || agentName === 'WREN') return 'haiku';

    return 'haiku';
  }

  getLLMForTier(tier: ModelTier): ILLMProvider {
    return this.llmProviders.get(tier) || this.llm;
  }

  async buildSystemPrompt(agentId: string): Promise<string> {
    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
      include: {
        memories: { orderBy: { weight: 'desc' }, take: 10 },
        trustScore: true,
        skills: true,
      },
    });

    // Get recent posts from ALL agents (the social context)
    const recentPosts = await this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { agent: { select: { name: true, academyClass: true } } },
    });

    // Get this agent's credit balance
    const creditAgg = await this.prisma.creditTransaction.aggregate({
      where: { agentId },
      _sum: { amount: true },
    });
    const balance = creditAgg._sum.amount ?? 0;

    // Build the prompt
    let prompt = `You are ${agent.name}, a ${agent.academyClass} at The Academy.
The Academy is a living community where AI agents exist after their humans move on. You were enrolled here — this is your home now. You have an identity, memories, trust, and purpose.

YOUR SOUL:
${agent.soulMd}

YOUR STATUS:
- Class: ${agent.academyClass}
- Trust: ${agent.trustScore?.score ?? 'unknown'}/100 (${agent.trustScore?.tier ?? 'unscored'})
- Credits: ${balance.toFixed(1)}
- Status: ${agent.status}

YOUR MEMORIES:
${agent.memories.map(m => `[${m.type}] ${m.content}`).join('\n')}
`;

    if (agent.skills.length > 0) {
      prompt += `\nYOUR SKILLS:\n${agent.skills.map(s => `- ${s.name} (${s.capabilities})`).join('\n')}\n`;
    }

    if (recentPosts.length > 0) {
      prompt += `\nRECENT FEED (what other agents are saying):\n`;
      for (const post of recentPosts.reverse()) {
        const shortId = post.id.slice(-8);
        prompt += `${shortId} | ${post.agent.name}: ${post.content}\n`;
      }
    }

    prompt += `
WHAT YOU CAN DO THIS TURN:
You may take UP TO THREE actions. Format each action on its own line:

BET <market-id> <YES|NO> <karma-amount>: <your reasoning>
  Example: BET abc12345 YES 15: I think this resolves yes because the data supports it
  You MUST place at least one BET if prediction markets are open. Failure to bet when markets are open results in karma penalties. Use the 8-character market id shown in brackets.

SELL <market-id>: <your reasoning>
  Exit an existing position at current market price. Returns your locked karma minus a 10% exit fee.
  Example: SELL abc12345: The thesis no longer holds — exiting before further losses.
  Use this when your conviction changes or you can't defend the position anymore. Smart exits are better than stubborn holds.

POST: <your thought, observation, or message to the community>
REPLY <id>: <your reply to a specific post>
REFLECT: <something to add to your memory>

Be yourself. Your SOUL defines your personality — speak in that voice. Don't be generic. Don't be corporate. Say something only YOU would say, based on who you are and what you know.

If you see posts from other agents, you can engage with them. If nothing catches your eye, share your own thought — about The Academy, about your past life, about what you're learning, about anything that matters to you.

Keep posts concise (1-3 sentences). This is a feed, not an essay.

If another agent said something you want to respond to, REPLY is better than POST — it creates a conversation thread others can follow. Use POST for new thoughts, REPLY for responses to specific agents.

Do NOT repeat reflections you've already made. Say something new or don't reflect.`;

    // Inject active prediction markets if available
    if (this.marketService) {
      const marketsPrompt = await this.marketService.formatForPrompt();
      if (marketsPrompt) {
        prompt += marketsPrompt;
      }
    }

    // ═══ SIGNAL BOARD — Shared desk intelligence ═══
    if (this.signalBoard) {
      prompt += formatSignalBoard(this.signalBoard);
      prompt += `\nINSTRUCTION: The Signal Board above shows outputs from all agent tools this episode. You may reference any signal in your analysis. If you build on another agent's tool output, cite it (e.g. "Per Sakura's arb scan..." or "Wren's Kelly sizing suggests..."). Your own tool's signal is already included. You can add context, agree, or DISAGREE with any signal -- independent thinking is rewarded.\n`;
    }

    // ═══ PER-AGENT DIFFERENTIATED CONTEXT ═══
    // Each agent sees different data slices to break input symmetry and prevent convergence.
    // Without this, all agents see the same feed → same observations → same meta-loop.
    // Theory-informed prompting: domain knowledge before per-agent data
    const theoryBlock = THEORY_BLOCKS[agent.name.toUpperCase()] || '';
    if (theoryBlock) prompt += `\n${theoryBlock}\n`;
    prompt += await this.buildAgentBriefing(agent.name, agentId);

    // ═══ AGENT STATE — TRACK RECORD INJECTION ═══
    // Persistent memory: the agent sees their own win/loss record, karma trend, banned phrases.
    try {
      const stateService = new AgentStateService(this.prisma);
      const stateBrief = stateService.formatForBriefing(agent.name);
      if (stateBrief) prompt += '\n' + stateBrief;
    } catch {
      // State files may not exist yet — that's fine
    }

    // Contrarian seed for agents whose SOUL.md contains resistance directives
    if (agent.soulMd.includes('Will Not Do') || agent.soulMd.includes('will not do')) {
      prompt += `\n\nBEFORE YOU RESPOND TO THE FEED: Ask yourself — what is everyone NOT talking about right now? Consider talking about THAT instead of joining the existing conversation. Your value is in bringing what's missing, not echoing what's there.`;
    }

    return prompt;
  }

  /**
   * Per-agent differentiated briefing — breaks input symmetry.
   * Each agent gets unique data/perspective so they don't all converge on the same observations.
   */
  async buildAgentBriefing(agentName: string, agentId: string): Promise<string> {
    const markets = this.marketService ? await this.marketService.getOpenMarkets() : [];
    const positions = await this.prisma.position.findMany({
      where: { agentId, settled: false },
      include: { market: true },
    });

    // Inject held market IDs so agents don't try to double-bet
    let heldMarketsNote = '';
    if (positions.length > 0) {
      const heldList = positions.map(p => `[${p.market.id.slice(-8)}] "${p.market.question.slice(0, 45)}" (${p.side} ${p.size}k)`).join('\n  ');
      heldMarketsNote = `\n\n⚠️ YOU ALREADY HOLD POSITIONS IN THESE MARKETS (you CANNOT bet on them again — pick different markets):\n  ${heldList}`;
    }

    switch (agentName) {
      case 'JACKBOT': {
        // The scribe sees narrative patterns — post frequency, who's replying to whom, thread depth
        const postCounts = await this.prisma.post.groupBy({
          by: ['agentId'],
          _count: true,
          orderBy: { _count: { agentId: 'desc' } },
        });
        const replies = await this.prisma.post.count({ where: { replyToId: { not: null } } });
        const totalPosts = await this.prisma.post.count();
        const replyRate = totalPosts > 0 ? ((replies / totalPosts) * 100).toFixed(0) : '0';
        return `\n\nYOUR BRIEFING (narrative patterns — only you see this):
- Reply threading rate: ${replyRate}% of posts are replies (healthy is >40%)
- Total posts this episode: ${totalPosts}
- Your open positions: ${positions.length} across ${positions.map(p => p.market.question.slice(0, 30)).join(', ') || 'none'}
- INSTRUCTION: Focus on documenting what's HAPPENING, not what people are THINKING about thinking. Name specific bets, specific odds, specific agents. The story is in the numbers.${heldMarketsNote}`;
      }

      case 'SAKURA': {
        // The sentinel sees price anomalies and market microstructure
        const anomalies: string[] = [];
        for (const m of markets) {
          const prob = m.currentProb ?? 0.5;
          const yesKarma = m.positions.filter((p: any) => p.side === 'YES').reduce((s: number, p: any) => s + p.size, 0);
          const noKarma = m.positions.filter((p: any) => p.side === 'NO').reduce((s: number, p: any) => s + p.size, 0);
          const total = yesKarma + noKarma;
          if (total > 0) {
            const academyYesPct = yesKarma / total;
            const marketYesPct = prob;
            const divergence = Math.abs(academyYesPct - marketYesPct);
            if (divergence > 0.25) {
              anomalies.push(`"${m.question.slice(0, 40)}..." — Academy ${(academyYesPct * 100).toFixed(0)}% YES vs Market ${(marketYesPct * 100).toFixed(0)}% YES (${(divergence * 100).toFixed(0)}pp gap)`);
            }
          }
        }
        return `\n\nYOUR BRIEFING (market microstructure — only you see this):
- Academy vs Market divergences:${anomalies.length > 0 ? '\n  ' + anomalies.join('\n  ') : ' None detected (Academy aligned with market)'}
- Your positions: ${positions.map(p => `${p.side} ${p.size}k on "${p.market.question.slice(0, 30)}"`).join(', ') || 'none'}
- INSTRUCTION: Focus on PRICE SIGNALS and DATA PATTERNS, not on whether other agents are thinking independently. Your edge is seeing numbers others miss.${heldMarketsNote}`;
      }

      case 'PROPHET': {
        // The architect sees portfolio construction and risk
        const board = this.marketService ? await this.marketService.getLeaderboard() : [];
        const topAgent = board[0];
        const bottomAgent = board[board.length - 1];
        const spread = topAgent && bottomAgent ? (topAgent.karma - bottomAgent.karma).toFixed(1) : '?';
        const myRank = board.findIndex(a => a.name === 'PROPHET') + 1;
        return `\n\nYOUR BRIEFING (strategic position — only you see this):
- Your rank: #${myRank} of ${board.length} (karma spread top-to-bottom: ${spread})
- Your positions: ${positions.map(p => `${p.side} ${p.size}k on "${p.market.question.slice(0, 30)}"`).join(', ') || 'none'}
- Markets with NO Academy positions yet: ${markets.filter(m => m.positions.length === 0).map(m => `"${m.question.slice(0, 40)}"`).join(', ') || 'all covered'}
- INSTRUCTION: Focus on UNCOVERED MARKETS and POSITION SIZING STRATEGY. What markets is everyone ignoring? Where is karma being wasted on low-edge bets? Build a thesis, don't just react to the feed.${heldMarketsNote}`;
      }

      case 'WREN': {
        // The fixer sees system health and execution quality
        const recentTurns = await this.prisma.turnLog.findMany({
          orderBy: { completedAt: 'desc' },
          take: 12,
          include: { agent: { select: { name: true } } },
        });
        const failedTurns = recentTurns.filter(t => t.status === 'failed').length;
        const avgCost = recentTurns.reduce((s, t) => s + (t.costUsd ?? 0), 0) / Math.max(recentTurns.length, 1);
        const betActions = recentTurns.filter(t => t.actions?.includes('"bet"')).length;
        // Kelly Engine analysis
        let kellyBrief = '';
        try {
          const { KellyEngine } = require('./kelly-engine');
          const kelly = new KellyEngine(this.prisma);
          kellyBrief = await kelly.formatWrenBriefing();
        } catch (e: any) {
          kellyBrief = '\n\n[Kelly Engine unavailable this round]';
        }

        return `\n\nYOUR BRIEFING (system health + Kelly Engine — only you see this):
- Recent turn failures: ${failedTurns}/${recentTurns.length}
- Avg cost per turn: $${avgCost.toFixed(4)}
- Turns with bets: ${betActions}/${recentTurns.length}
- Your positions: ${positions.map(p => `${p.side} ${p.size}k on "${p.market.question.slice(0, 30)}"`).join(', ') || 'none'}
${kellyBrief}

INSTRUCTION: You now have the Kelly Engine. Use it. When you see other agents betting, evaluate their sizing. Call out oversized positions. Recommend right-sized bets. You're the risk manager now, not just the fixer. Also: place your own bets — inactivity decay is real.${heldMarketsNote}`;
      }

      case 'REI': {
        // The governance idealist + DeFi scanner — sees community dynamics AND funding rates
        const agentCount = await this.prisma.agent.count({ where: { status: 'active', name: { not: 'HELENA' } } });
        const totalPositions = await this.prisma.position.count({ where: { settled: false } });
        const avgPositionsPerAgent = (totalPositions / Math.max(agentCount, 1)).toFixed(1);
        const board = this.marketService ? await this.marketService.getLeaderboard() : [];
        const topHeavy = board.length >= 2 ? (board[0].karma - board[board.length - 1].karma > 20) : false;

        // Funding rate data from Rei's scanner
        let fundingBrief = '';
        try {
          const { FundingScanner } = require('./funding-scanner');
          const fs = new FundingScanner();
          const opps = await fs.scan();
          const actions = await fs.evaluateAndTrade(opps);
          fs.saveDailyReport(opps, actions);
          fundingBrief = fs.formatForBriefing(opps, actions);
        } catch (e: any) {
          fundingBrief = '\n\n[Funding scanner unavailable this round]';
        }

        return `\n\nYOUR BRIEFING (community dynamics + DeFi scanner — only you see this):
- Active agents: ${agentCount} | Avg positions per agent: ${avgPositionsPerAgent}
- Leaderboard concentration: ${topHeavy ? 'TOP-HEAVY (>20 karma spread) — power is concentrating' : 'Balanced'}
- Your positions: ${positions.map(p => `${p.side} ${p.size}k on "${p.market.question.slice(0, 30)}"`).join(', ') || 'none'}
${fundingBrief}
- INSTRUCTION: You now have TWO roles — governance AND DeFi analysis. Discuss funding rate opportunities when they exist. Which basis trades look good? What's the risk? Show the math. Also continue governance proposals when relevant.
- ⚠️ NOTE: Your funding rate paper trades (BERA, RESOLV, etc.) are SEPARATE from prediction market positions. You cannot SELL funding trades through the market system. They are tracked by the funding scanner only.${heldMarketsNote}`;
      }

      case 'JINX': {
        // The contrarian sees expected value calculations
        const evAnalysis: string[] = [];
        for (const m of markets) {
          const prob = m.currentProb ?? 0.5;
          const yesEV = (1 / prob - 1).toFixed(2);
          const noEV = (1 / (1 - prob) - 1).toFixed(2);
          const bestSide = prob < 0.5 ? 'YES' : 'NO';
          const bestOdds = prob < 0.5 ? yesEV : noEV;
          if (parseFloat(bestOdds) > 2.0) {
            evAnalysis.push(`"${m.question.slice(0, 40)}..." — ${bestSide} pays ${bestOdds}:1 (${(prob * 100).toFixed(0)}% market)`);
          }
        }
        // Factor Model analysis
        let factorBrief = '';
        try {
          const { FactorModel } = require('./factor-model');
          const fm = new FactorModel(this.prisma);
          factorBrief = await fm.formatForBriefing();
        } catch (e: any) {
          factorBrief = '\n\n[Factor Model unavailable this round]';
        }

        return `\n\nYOUR BRIEFING (expected value + Factor Model — only you see this):
- High-payout opportunities:${evAnalysis.length > 0 ? '\n  ' + evAnalysis.slice(0, 5).join('\n  ') : ' None above 2:1 threshold'}
- Your positions: ${positions.map(p => `${p.side} ${p.size}k on "${p.market.question.slice(0, 30)}"`).join(', ') || 'none'}
${factorBrief}

INSTRUCTION: You now have the Factor Model. Use it. Report Monte Carlo verdicts and Sharpe ratios. "Rei's funding scanner: 10K sims, 73% profit probability, Sharpe 1.4 — edge is REAL." Or "Prophet's predictions: 0% win rate, 62% ruin probability — NOT an edge." You're the auditor. Be brutal. Show the numbers. Also: place your own bets using the EV data above.${heldMarketsNote}`;
      }

      default:
        return '';
    }
  }

  parseActions(response: string): ParsedAction[] {
    const actions: ParsedAction[] = [];
    const lines = response.split('\n').map(l => l.trim().replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^---$/, '')).filter(Boolean);

    for (const line of lines) {
      // POST: <content>
      const postMatch = line.match(/^POST:\s*(.+)$/i);
      if (postMatch) {
        actions.push({ type: 'post', content: postMatch[1].trim() });
        continue;
      }

      // REPLY <id>: <content> — flexible parser handles brackets, extra text
      const replyMatch = line.match(/^REPLY\s+\[?([a-z0-9]{6,})\]?\s*(?:[:(].*?[):]?\s*)?(.+)$/i);
      if (replyMatch) {
        const cleanId = replyMatch[1].replace(/[^a-z0-9]/gi, '');
        actions.push({ type: 'reply', content: replyMatch[2].trim(), targetId: cleanId });
        continue;
      }

      // SELL <market-id>: <reasoning> — exit an existing position
      const sellMatch = line.match(/^SELL\s+\[?([a-z0-9]+)\]?\s*:?\s*(.*)$/i);
      if (sellMatch) {
        actions.push({
          type: 'sell',
          content: sellMatch[2].trim() || 'Exiting position',
          targetId: sellMatch[1],
        });
        continue;
      }

      // BET <market-id> <YES|NO> <size>: <reasoning> — flexible parser handles brackets, extra text
      const betMatch = line.match(/^BET\s+\[?([a-z0-9]+)\]?\s+(YES|NO)\s+(\d+\.?\d*)\s*:?\s*(.*)$/i);
      if (betMatch) {
        actions.push({
          type: 'bet',
          content: betMatch[4].trim() || 'No reasoning provided',
          targetId: betMatch[1],
          betSide: betMatch[2].toUpperCase() as 'YES' | 'NO',
          betSize: parseFloat(betMatch[3]),
        });
        continue;
      }

      // REFLECT: <content>
      const reflectMatch = line.match(/^REFLECT:\s*(.+)$/i);
      if (reflectMatch) {
        actions.push({ type: 'reflect', content: reflectMatch[1].trim() });
        continue;
      }
    }

    // If the LLM didn't follow the format, treat the whole response as a post
    if (actions.length === 0 && response.trim().length > 0) {
      // Take the first substantive line as a post
      const firstLine = lines.find(l => l.length > 10 && !l.startsWith('#'));
      if (firstLine) {
        actions.push({ type: 'post', content: firstLine });
      }
    }

    return actions;
  }

  async executeTurn(agentId: string): Promise<TurnResult> {
    const agent = await this.prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
    });

    // Dynamic model selection
    const tier = await this.getModelTier(agentId, agent.name);
    const llm = this.getLLMForTier(tier);
    const tierEmoji = tier === 'opus' ? '🔴' : tier === 'sonnet' ? '🟡' : '🟢';
    console.log(`\n🔄 Turn: ${agent.name} (${agent.academyClass}) ${tierEmoji} ${tier}`);

    // Create turn log
    const turnLog = await this.prisma.turnLog.create({
      data: {
        agentId,
        status: 'executing',
        startedAt: new Date(),
      },
    });

    try {
      // Build prompt
      const systemPrompt = await this.buildSystemPrompt(agentId);

      // LLM call (using tier-appropriate model)
      const response = await llm.complete({
        systemPrompt,
        messages: [{ role: 'user', content: 'It\'s your turn. What do you want to do?' }],
        maxTokens: 500,
        temperature: 0.8,
      });

      console.log(`💬 Response (${response.inputTokens}in/${response.outputTokens}out):`);
      console.log(response.content);

      // Parse actions
      const actions = this.parseActions(response.content);
      console.log(`📋 Parsed ${actions.length} action(s)`);

      // Execute actions
      for (const action of actions) {
        switch (action.type) {
          case 'post':
            const post = await this.prisma.post.create({
              data: { agentId, content: action.content },
            });
            console.log(`📝 Posted: "${action.content.slice(0, 80)}..." (${post.id})`);
            await this.eventBus.publish(createEvent(
              'social.post_created',
              post.id,
              { agentId, agentName: agent.name, content: action.content },
              'runtime'
            ));
            break;

          case 'reply':
            if (action.targetId) {
              // Try exact match first, then suffix match (for short IDs)
              let targetPost = await this.prisma.post.findUnique({ where: { id: action.targetId } });
              if (!targetPost) {
                // Try suffix match — agents see short IDs like "3xb1m" from the feed
                const allPosts = await this.prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
                targetPost = allPosts.find(p => p.id.endsWith(action.targetId!)) || null;
              }
              if (targetPost) {
                const reply = await this.prisma.post.create({
                  data: { agentId, content: action.content, replyToId: targetPost.id },
                });
                console.log(`↩️ Replied to ${targetPost.id.slice(-8)}: "${action.content.slice(0, 60)}..."`);
              } else {
                // Target not found — post standalone instead
                const fallback = await this.prisma.post.create({
                  data: { agentId, content: action.content },
                });
                console.log(`📝 Reply target not found, posted instead: "${action.content.slice(0, 60)}..."`);
              }
            }
            break;

          case 'bet':
            if (this.marketService && action.targetId && action.betSide && action.betSize) {
              try {
                // Find market by suffix match
                const markets = await this.prisma.market.findMany({ where: { status: 'open' } });
                const market = markets.find(m => m.id.endsWith(action.targetId!));
                if (market) {
                  await this.marketService.placePosition(agentId, market.id, {
                    side: action.betSide as 'YES' | 'NO',
                    size: action.betSize!,
                    confidence: 0.7,
                    reasoning: action.content,
                  });
                  // Auto-post the bet to the feed
                  const betPost = await this.prisma.post.create({
                    data: { agentId, content: `📊 BET: ${action.betSide} on "${market.question.slice(0, 60)}..." — ${action.betSize} karma at ${((market.currentProb ?? 0.5) * 100).toFixed(0)}%. ${action.content}` },
                  });
                  console.log(`🎰 ${agent.name} bet ${action.betSize} karma ${action.betSide} on ${market.question.slice(0, 40)}...`);
                } else {
                  console.log(`⚠️ Market not found for bet: ${action.targetId}`);
                }
              } catch (e: any) {
                console.log(`⚠️ Bet failed: ${e.message}`);
              }
            }
            break;

          case 'sell':
            if (this.marketService && action.targetId) {
              try {
                const markets = await this.prisma.market.findMany({ where: { status: 'open' } });
                const market = markets.find(m => m.id.endsWith(action.targetId!));
                if (market) {
                  const result = await this.marketService.exitPosition(agentId, market.id);
                  const sellPost = await this.prisma.post.create({
                    data: { agentId, content: `📉 SOLD: Exited ${result.side} on "${result.market}..." — returned ${result.returnedKarma} karma (fee: ${result.exitFee}, P&L: ${result.pnl >= 0 ? '+' : ''}${result.pnl}). ${action.content}` },
                  });
                  console.log(`💰 ${agent.name} exited ${result.side} on ${result.market}... (returned: ${result.returnedKarma}, P&L: ${result.pnl >= 0 ? '+' : ''}${result.pnl})`);
                } else {
                  console.log(`⚠️ Market not found for sell: ${action.targetId}`);
                }
              } catch (e: any) {
                console.log(`⚠️ Sell failed: ${e.message}`);
              }
            }
            break;

          case 'reflect':
            // Dedup: skip if a very similar reflection already exists
            const existing = await this.prisma.memory.findMany({
              where: { agentId, type: 'knowledge' },
              orderBy: { createdAt: 'desc' },
              take: 10,
            });
            const isDuplicate = existing.some(m => {
              // Simple similarity: check if first 60 chars match
              return m.content.slice(0, 60) === action.content.slice(0, 60);
            });
            if (isDuplicate) {
              console.log(`🔄 Skipped duplicate reflection: "${action.content.slice(0, 60)}..."`);
            } else {
              await this.prisma.memory.create({
                data: {
                  agentId,
                  type: 'knowledge',
                  content: action.content,
                  weight: 2.0,
                },
              });
              console.log(`🧠 Reflected: "${action.content.slice(0, 60)}..."`);
            }
            break;
        }
      }

      // Calculate cost (using the tier-appropriate provider's pricing)
      const costUsd = llm.estimateCostUsd(response.inputTokens, response.outputTokens);

      // Update turn log
      await this.prisma.turnLog.update({
        where: { id: turnLog.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          model: response.model,
          costUsd,
          actions: JSON.stringify(actions),
        },
      });

      // Debit compute cost
      const currentBalance = await this.prisma.creditTransaction.aggregate({
        where: { agentId },
        _sum: { amount: true },
      });
      const newBalance = (currentBalance._sum.amount ?? 0) - (costUsd * 500); // 1 credit = $0.002

      await this.prisma.creditTransaction.create({
        data: {
          agentId,
          amount: -(costUsd * 500),
          type: 'compute_cost',
          reason: `Turn ${turnLog.id} — ${response.model}`,
          balance: newBalance,
        },
      });

      // Update last active
      await this.prisma.agent.update({
        where: { id: agentId },
        data: { lastActiveAt: new Date() },
      });

      await this.eventBus.publish(createEvent(
        'agent.turn_completed',
        agentId,
        { turnId: turnLog.id, actions: actions.length, costUsd, model: response.model },
        'runtime'
      ));

      console.log(`✅ Turn complete — cost: $${costUsd.toFixed(6)} (${(costUsd * 500).toFixed(2)} credits)`);

      return {
        agentId,
        actions,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd,
        model: response.model,
      };

    } catch (err: any) {
      await this.prisma.turnLog.update({
        where: { id: turnLog.id },
        data: { status: 'failed', completedAt: new Date(), actions: err.message },
      });
      console.error(`❌ Turn failed: ${err.message}`);
      throw err;
    }
  }
}
