/**
 * CONVERGENCE LINTER — Mechanical entropy reduction
 * 
 * Scans all agent posts from an episode, detects repeated phrases across agents,
 * and updates state files with banned phrases.
 * 
 * This is the "golden principles" approach from the Codex blog:
 * Don't ask agents to be different via prompts. Enforce linguistic diversity
 * the same way linters enforce code quality.
 */

import { PrismaClient } from '@prisma/client';
import { AgentStateService } from './agent-state';

// Minimum phrase length to consider (words)
const MIN_PHRASE_WORDS = 3;
// Maximum phrase length to extract (words)
const MAX_PHRASE_WORDS = 6;
// Minimum agents using the same phrase to flag it
const MIN_AGENTS_FOR_FLAG = 2;

export class ConvergenceLinter {
  constructor(
    private prisma: PrismaClient,
    private stateService: AgentStateService,
  ) {}

  /**
   * Extract n-grams from text
   */
  private extractPhrases(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

    const phrases: string[] = [];
    for (let n = MIN_PHRASE_WORDS; n <= MAX_PHRASE_WORDS; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        phrases.push(words.slice(i, i + n).join(' '));
      }
    }
    return phrases;
  }

  /**
   * Scan episode posts and detect convergent phrases
   */
  async scan(runNumber: number): Promise<{
    flaggedPhrases: string[];
    agentPhraseMap: Map<string, Set<string>>;
  }> {
    // Get all non-Helena posts from this episode
    const posts = await this.prisma.post.findMany({
      where: { agent: { name: { not: 'HELENA' } } },
      include: { agent: { select: { name: true } } },
    });

    // Build phrase → set of agent names
    const phraseAgents = new Map<string, Set<string>>();

    for (const post of posts) {
      // Skip short posts — "Agreed" and "I see" shouldn't trigger convergence flags
      if (post.content.length < 50) continue;
      
      // Strip system-generated action prefixes — only scan agent reasoning
      let content = post.content;
      content = content.replace(/^📊 BET:.*?karma at \d+%\.\s*/i, '');
      content = content.replace(/^📉 SOLD:.*?\)\.?\s*/i, '');
      if (content.length < 50) continue;
      
      const phrases = this.extractPhrases(content);
      for (const phrase of phrases) {
        if (!phraseAgents.has(phrase)) phraseAgents.set(phrase, new Set());
        phraseAgents.get(phrase)!.add(post.agent.name);
      }
    }

    // Filter to phrases used by multiple agents
    const flagged: string[] = [];
    phraseAgents.forEach((agents, phrase) => {
      if (agents.size >= MIN_AGENTS_FOR_FLAG) {
        flagged.push(phrase);
      }
    });

    // Deduplicate — if "conviction gap is" and "conviction gap" both flagged, keep the shorter one
    const deduped = this.deduplicatePhrases(flagged);

    // Sort by number of agents using them (most convergent first)
    deduped.sort((a, b) => {
      const aCount = phraseAgents.get(a)?.size ?? 0;
      const bCount = phraseAgents.get(b)?.size ?? 0;
      return bCount - aCount;
    });

    // Take top 10 max
    const topPhrases = deduped.slice(0, 10);

    return {
      flaggedPhrases: topPhrases,
      agentPhraseMap: phraseAgents,
    };
  }

  /**
   * Remove longer phrases that are supersets of shorter flagged phrases
   */
  private deduplicatePhrases(phrases: string[]): string[] {
    const sorted = [...phrases].sort((a, b) => a.split(' ').length - b.split(' ').length);
    const kept: string[] = [];

    for (const phrase of sorted) {
      const isSubsetOfKept = kept.some(k => phrase.includes(k));
      if (!isSubsetOfKept) {
        kept.push(phrase);
      }
    }

    return kept;
  }

  /**
   * Update all agent state files with convergence flags
   */
  async updateStates(runNumber: number): Promise<string[]> {
    const { flaggedPhrases, agentPhraseMap } = await this.scan(runNumber);

    if (flaggedPhrases.length === 0) return [];

    // Load all agents
    const agents = await this.prisma.agent.findMany({
      where: { status: 'active', name: { not: 'HELENA' } },
    });

    for (const agent of agents) {
      const state = this.stateService.loadState(agent.name);
      if (!state) continue;

      // Add newly flagged phrases that aren't already banned
      const existingBanned = new Set(state.convergenceFlags.bannedPhrases.map(bp => bp.phrase));
      for (const phrase of flaggedPhrases) {
        // Only ban if this agent actually used the phrase
        const usedBy = agentPhraseMap.get(phrase);
        if (usedBy?.has(agent.name) && !existingBanned.has(phrase)) {
          state.convergenceFlags.bannedPhrases.push({
            phrase,
            bannedAtRun: runNumber,
          });
        }
      }

      state.convergenceFlags.phrasesUsedByMultipleAgents = flaggedPhrases;

      // Save back
      const statePath = require('path').join(__dirname, '..', '..', 'state', `${agent.name.toLowerCase()}.json`);
      require('fs').writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    }

    return flaggedPhrases;
  }
}
