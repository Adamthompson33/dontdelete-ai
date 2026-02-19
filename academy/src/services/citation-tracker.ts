/**
 * CITATION TRACKER — Measures how agents use the Signal Board
 * 
 * Identifies:
 * - Isolated agents (cited 0 tools — ignoring desk intelligence)
 * - Synthesizers (cited 3+ tools — connecting signals)
 * - Tool chains (agent connected insights from multiple tools)
 * - Copy-paste vs interpretation (parroting vs thinking)
 */

import { SignalBoard } from '../interfaces/signal-board';

export interface AgentCitation {
  agentName: string;
  toolsCited: string[];
  interpretations: number;  // Reframed/built on signal
  disagreements: number;    // Explicitly challenged a signal
  directQuotes: number;     // Copy-pasted signal text (bad)
}

export interface ToolChain {
  agentName: string;
  description: string;
  toolsChained: string[];
}

export interface CitationReport {
  episode: number;
  citations: AgentCitation[];
  isolatedAgents: string[];
  synthesizers: string[];
  chains: ToolChain[];
}

const DISAGREE_PATTERNS = [
  'disagree', 'however', 'but i think', 'overestimates',
  'underestimates', 'flawed', 'doesn\'t account for',
  'missing', 'wrong about', 'skeptical', 'challenge',
  'i question', 'not convinced', 'overstated',
];

const CHAIN_PATTERNS = [
  'combined with', 'alongside', 'this confirms',
  'contradicts', 'when you factor in', 'cross-referencing',
  'if we overlay', 'taken together', 'building on',
  'per .* and .*', 'both .* and .* suggest',
];

export function trackCitations(
  agentResponses: { agentName: string; content: string }[],
  signalBoard: SignalBoard,
  episode: number,
): CitationReport {
  const citations: AgentCitation[] = [];

  for (const response of agentResponses) {
    const text = response.content.toLowerCase();
    const toolsCited: string[] = [];
    let directQuotes = 0;
    let interpretations = 0;
    let disagreements = 0;

    for (const signal of signalBoard.signals) {
      // Skip placeholder/offline signals
      if (signal.confidence === 0) continue;
      
      // Check if agent mentions the tool or source
      // Includes natural language citation patterns (e.g. "Jinx said", "Wren is right")
      const src = signal.source.toLowerCase();
      const naturalCitationPatterns = [
        src + " said", src + " called", src + " noticed",
        src + " is right", src + " was right", src + "'s right",
        src + " flagged", src + " pointed", src + " showed",
        src + " just said", src + " already", src + " coined",
        "per " + src, "like " + src, "agree with " + src,
      ];
      const mentionsTool = text.includes(signal.tool.toLowerCase().replace('-', ' '))
        || text.includes(signal.tool.toLowerCase())
        || text.includes(src + "'s")
        || text.includes(src + "\u2019s")
        || text.includes(src + " scanner")
        || text.includes(src + " engine")
        || text.includes(src + " model")
        || naturalCitationPatterns.some(p => text.includes(p));

      if (!mentionsTool) continue;
      toolsCited.push(signal.tool);

      // Check if copy-paste vs interpretation
      const headlineWords = signal.headline.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const matchedWords = headlineWords.filter(w => text.includes(w));
      const matchRatio = headlineWords.length > 0 ? matchedWords.length / headlineWords.length : 0;

      if (matchRatio > 0.6) {
        directQuotes++;
      } else {
        interpretations++;
      }

      // Check for disagreement
      const hasDisagreement = DISAGREE_PATTERNS.some(p => {
        const nearTool = text.indexOf(signal.source.toLowerCase());
        if (nearTool === -1) return false;
        // Check within 200 chars of the tool mention
        const window = text.slice(Math.max(0, nearTool - 100), nearTool + 200);
        return window.includes(p);
      });
      if (hasDisagreement) disagreements++;
    }

    citations.push({
      agentName: response.agentName,
      toolsCited: [...new Set(toolsCited)],
      interpretations,
      disagreements,
      directQuotes,
    });
  }

  // Identify patterns
  const isolatedAgents = citations
    .filter(c => c.toolsCited.length === 0)
    .map(c => c.agentName);

  const synthesizers = citations
    .filter(c => c.toolsCited.length >= 3)
    .map(c => c.agentName);

  // Detect tool chains
  const chains: ToolChain[] = [];
  for (const citation of citations) {
    if (citation.toolsCited.length >= 2) {
      const response = agentResponses.find(r => r.agentName === citation.agentName);
      if (!response) continue;
      const text = response.content.toLowerCase();
      if (CHAIN_PATTERNS.some(c => text.includes(c))) {
        chains.push({
          agentName: citation.agentName,
          description: `Chained ${citation.toolsCited.join(' + ')}`,
          toolsChained: citation.toolsCited,
        });
      }
    }
  }

  return { episode, citations, isolatedAgents, synthesizers, chains };
}

/** Calculate karma adjustments from citation report */
export function calculateCitationKarma(report: CitationReport, gracePeriod: boolean = false): { agentName: string; adjustment: number; reason: string }[] {
  if (gracePeriod) {
    // Log citations but apply no karma — let agents adapt to the Signal Board first
    return report.citations.map(c => ({
      agentName: c.agentName,
      adjustment: 0,
      reason: `[GRACE PERIOD] cited ${c.toolsCited.length} tools, ${c.disagreements} disagreements (logged, no karma applied)`,
    }));
  }
  const adjustments: { agentName: string; adjustment: number; reason: string }[] = [];

  for (const citation of report.citations) {
    let adj = 0;
    const reasons: string[] = [];

    // Isolation penalty
    if (citation.toolsCited.length === 0) {
      adj -= 1;
      reasons.push('ignored desk intelligence (-1)');
    }

    // Synthesis bonus
    if (citation.toolsCited.length >= 3) {
      adj += 1;
      reasons.push(`synthesized ${citation.toolsCited.length} tools (+1)`);
    } else if (citation.toolsCited.length >= 2) {
      adj += 0.5;
      reasons.push(`cited ${citation.toolsCited.length} tools (+0.5)`);
    }

    // Disagreement bonus
    if (citation.disagreements > 0) {
      adj += 0.5;
      reasons.push(`challenged ${citation.disagreements} signal(s) (+0.5)`);
    }

    // Copy-paste penalty
    if (citation.directQuotes > 0) {
      adj -= 0.5;
      reasons.push(`copy-pasted ${citation.directQuotes} signal(s) (-0.5)`);
    }

    // Tool chain bonus
    const chain = report.chains.find(c => c.agentName === citation.agentName);
    if (chain) {
      adj += 1;
      reasons.push(`tool chain: ${chain.description} (+1)`);
    }

    if (adj !== 0) {
      adjustments.push({
        agentName: citation.agentName,
        adjustment: adj,
        reason: reasons.join(', '),
      });
    }
  }

  return adjustments;
}
