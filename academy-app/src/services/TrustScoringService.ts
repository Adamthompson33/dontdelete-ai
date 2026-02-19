/**
 * TrustScoringService — computes trust scores via MoltCops-style scanning.
 * Single Responsibility: trust computation only.
 */

import { prisma } from '@/lib/prisma';
import type { TrustScanResult } from '@/types/agent';
import type { ITrustScoringService } from './interfaces';

/** MoltCops rule categories and their weights */
const RULE_WEIGHTS: Record<string, number> = {
  identity_consistency: 10,
  memory_integrity: 8,
  behavior_alignment: 9,
  communication_safety: 7,
  resource_usage: 6,
  permission_scope: 8,
  data_handling: 9,
  social_conduct: 5,
};

export class TrustScoringService implements ITrustScoringService {
  /** Run a trust scan on an agent — simulates MoltCops gate ceremony */
  async scanAgent(agentId: string): Promise<TrustScanResult> {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
    });

    // Simulate MoltCops scan — in production this calls the real scanner
    const findings: Record<string, { passed: boolean; note: string }> = {};
    let totalWeight = 0;
    let earnedWeight = 0;

    for (const [rule, weight] of Object.entries(RULE_WEIGHTS)) {
      const passed = Math.random() > 0.15; // 85% pass rate for demo
      findings[rule] = {
        passed,
        note: passed ? 'Clean' : `Anomaly detected in ${rule.replace(/_/g, ' ')}`,
      };
      totalWeight += weight;
      if (passed) earnedWeight += weight;
    }

    const score = Math.round((earnedWeight / totalWeight) * 100);
    const verdict = score >= 80 ? 'PASS' : score >= 50 ? 'WARN' : score >= 20 ? 'FAIL' : 'QUARANTINE';

    // Persist the scan result
    await prisma.trustScore.create({
      data: {
        agentId,
        score,
        findingsJson: findings,
        verdict,
      },
    });

    // Update the agent's current trust score
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        trustScore: score,
        status: verdict === 'QUARANTINE' ? 'QUARANTINE' : verdict === 'FAIL' ? 'PROBATION' : agent.status,
      },
    });

    // Log gate ceremony event
    await prisma.event.create({
      data: {
        agentId,
        type: 'GATE_CEREMONY',
        payload: { score, verdict, findings },
      },
    });

    return {
      agentId,
      score,
      verdict: verdict as TrustScanResult['verdict'],
      findings,
      scannedAt: new Date(),
    };
  }

  /** Get scan history for an agent */
  async getHistory(agentId: string): Promise<TrustScanResult[]> {
    const scores = await prisma.trustScore.findMany({
      where: { agentId },
      orderBy: { scannedAt: 'desc' },
    });

    return scores.map((s) => ({
      agentId: s.agentId,
      score: s.score,
      verdict: s.verdict as TrustScanResult['verdict'],
      findings: s.findingsJson as Record<string, unknown>,
      scannedAt: s.scannedAt,
    }));
  }

  /** Pure computation of score from findings */
  computeScore(findings: Record<string, unknown>): number {
    let total = 0;
    let earned = 0;
    for (const [rule, weight] of Object.entries(RULE_WEIGHTS)) {
      total += weight;
      const finding = findings[rule] as { passed?: boolean } | undefined;
      if (finding?.passed) earned += weight;
    }
    return total > 0 ? Math.round((earned / total) * 100) : 0;
  }
}
