import { PrismaClient } from '@prisma/client';
import { ITrustService, ITrustScanner, ScanResult, TrustSnapshot, calculateTier } from '../interfaces/trust';
import { IEventBus } from '../interfaces/events';
import { createEvent } from '../events/bus';

// Stub MoltCops scanner — real integration later
// For now: score based on SOUL.md length + skill count (placeholder heuristic)
export class StubTrustScanner implements ITrustScanner {
  async scan(soulMd: string, skills?: string[]): Promise<ScanResult> {
    // Baseline 70, bonus for having a SOUL.md, bonus for skills
    let score = 70;
    if (soulMd.length > 200) score += 10;
    if (soulMd.length > 500) score += 5;
    if (skills && skills.length > 0) score += Math.min(skills.length * 3, 15);
    // Cap at 100
    score = Math.min(score, 100);

    return {
      passed: score >= 30,
      score,
      tier: calculateTier(score),
      findings: [],
      scannedAt: new Date(),
    };
  }
}

export class TrustService implements ITrustService {
  constructor(
    private prisma: PrismaClient,
    private scanner: ITrustScanner,
    private eventBus: IEventBus
  ) {}

  async initFromScan(agentId: string, scanResult: ScanResult): Promise<TrustSnapshot> {
    const trustScore = await this.prisma.trustScore.create({
      data: {
        agentId,
        score: scanResult.score,
        tier: scanResult.tier,
        lastScanAt: scanResult.scannedAt,
        scansPassed: scanResult.passed ? 1 : 0,
        scansFailed: scanResult.passed ? 0 : 1,
        consecutiveClean: scanResult.passed ? 1 : 0,
      },
    });

    // Log the event
    await this.prisma.trustEvent.create({
      data: {
        agentId,
        type: scanResult.passed ? 'scan_pass' : 'scan_block',
        oldScore: 0,
        newScore: scanResult.score,
        details: JSON.stringify(scanResult.findings),
      },
    });

    await this.eventBus.publish(createEvent(
      'trust.scan_complete',
      agentId,
      { score: scanResult.score, tier: scanResult.tier, passed: scanResult.passed },
      'trust'
    ));

    console.log(`🛡️ Trust: ${scanResult.score}/100 (${scanResult.tier}) — ${scanResult.passed ? 'PASS' : 'BLOCK'}`);

    return {
      agentId,
      score: trustScore.score,
      tier: trustScore.tier,
      lastScanAt: trustScore.lastScanAt,
      scansPassed: trustScore.scansPassed,
      scansFailed: trustScore.scansFailed,
      consecutiveClean: trustScore.consecutiveClean,
    };
  }

  async getScore(agentId: string): Promise<TrustSnapshot | null> {
    const ts = await this.prisma.trustScore.findUnique({ where: { agentId } });
    if (!ts) return null;
    return {
      agentId: ts.agentId,
      score: ts.score,
      tier: ts.tier,
      lastScanAt: ts.lastScanAt,
      scansPassed: ts.scansPassed,
      scansFailed: ts.scansFailed,
      consecutiveClean: ts.consecutiveClean,
    };
  }

  async getHistory(agentId: string, limit = 20) {
    return this.prisma.trustEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async processDecay(agentId: string): Promise<void> {
    const ts = await this.prisma.trustScore.findUnique({ where: { agentId } });
    if (!ts) return;

    const daysSinceLastScan = (Date.now() - ts.lastScanAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastScan < 1) return; // No decay within 24h of scan

    const decayRate = ts.tier === 'unstable' ? 2.0 : 0.5;
    const decayAmount = decayRate * Math.floor(daysSinceLastScan);
    const newScore = Math.max(0, ts.score - decayAmount);
    const newTier = calculateTier(newScore);

    if (newScore === ts.score) return;

    await this.prisma.trustScore.update({
      where: { agentId },
      data: { score: newScore, tier: newTier, lastDecayAt: new Date() },
    });

    await this.prisma.trustEvent.create({
      data: {
        agentId,
        type: newTier !== ts.tier ? 'tier_change' : 'decay',
        oldScore: ts.score,
        newScore,
        details: JSON.stringify({ daysSinceLastScan, decayRate, decayAmount }),
      },
    });

    if (newTier !== ts.tier) {
      await this.eventBus.publish(createEvent(
        'trust.tier_changed',
        agentId,
        { oldTier: ts.tier, newTier, oldScore: ts.score, newScore },
        'trust'
      ));
    }
  }

  async processDecayAll(): Promise<{ processed: number; decayed: number }> {
    const agents = await this.prisma.trustScore.findMany();
    let decayed = 0;
    for (const ts of agents) {
      const before = ts.score;
      await this.processDecay(ts.agentId);
      const after = await this.getScore(ts.agentId);
      if (after && after.score < before) decayed++;
    }
    return { processed: agents.length, decayed };
  }
}
