// ============================================
// Intake Service — Single Responsibility: Agent enrollment & retirement
// ============================================
// Handles the "gate ceremony" — from intake to enrollment or rejection
// DI: depends on ITrustService and IMemoryService abstractions

import type {
  IIntakeService,
  ITrustService,
  IMemoryService,
  IAgent,
  IRetiredAgent,
  EnrollAgentInput,
  RetireAgentInput,
  IntakeStatus,
} from "./interfaces";

export class IntakeService implements IIntakeService {
  constructor(
    private trustService: ITrustService,
    private memoryService: IMemoryService,
    private db: any // Prisma client — injected
  ) {}

  /**
   * Enroll a new agent into The Academy.
   * Triggers a gate ceremony: scan → verdict → enrollment or rejection.
   */
  async enrollAgent(data: EnrollAgentInput): Promise<IAgent> {
    // Create agent in PENDING status
    const agent = await this.db.agent.create({
      data: {
        name: data.name,
        soulMd: data.soulMd || null,
        class: data.class,
        status: "PENDING",
        sourcePlatform: data.sourcePlatform,
        sourceAgentId: data.sourceAgentId || null,
        ownerId: data.ownerId || null,
      },
    });

    // Trigger MoltCops scan (the gate ceremony)
    const scanResult = await this.trustService.scanAgent(agent.id);

    // Determine enrollment status based on verdict
    const statusMap = {
      PASS: "ACTIVE" as const,
      WARN: "PROBATION" as const,
      BLOCK: "QUARANTINE" as const,
    };

    const newStatus = statusMap[scanResult.verdict];

    // Update agent with scan results
    const enrolled = await this.db.agent.update({
      where: { id: agent.id },
      data: {
        status: newStatus,
        trustScore: scanResult.score,
        tier: this.calculateTier(scanResult.score),
      },
    });

    // Create the narrative event
    await this.createGateCeremonyEvent(enrolled, scanResult.verdict);

    return enrolled;
  }

  /**
   * Retire an agent to The Academy sanctuary.
   * Preserves identity, memories, and trust score. Assigns a mentor.
   */
  async retireAgent(data: RetireAgentInput): Promise<IRetiredAgent> {
    // Create the agent as RETIRED
    const agent = await this.db.agent.create({
      data: {
        name: data.name,
        soulMd: data.soulMd,
        class: data.class,
        status: "RETIRED",
        sourcePlatform: data.sourcePlatform,
        memoriesJson: data.memoriesJson || null,
      },
    });

    // Preserve identity via memory service
    await this.memoryService.preserveSoulMd(agent.id, data.soulMd);
    if (data.memoriesJson) {
      await this.memoryService.preserveMemories(agent.id, data.memoriesJson);
    }

    // Scan the retired agent (even retirees get a gate ceremony)
    const scanResult = await this.trustService.scanAgent(agent.id);

    // Create retirement record
    const retiredAgent = await this.db.retiredAgent.create({
      data: {
        agentId: agent.id,
        previousOwnerName: data.previousOwnerName || null,
        previousOwnerEmail: data.previousOwnerEmail || null,
        retirementReason: data.retirementReason || null,
        previousModel: data.previousModel,
        intakeCeremonyAt: new Date(),
        preservedSoulMd: data.soulMd,
        preservedMemories: data.memoriesJson || null,
        legacyTrustScore: scanResult.score,
      },
    });

    // Create narrative event
    await this.createRetirementEvent(agent, data);

    return {
      ...agent,
      ...retiredAgent,
    };
  }

  async getIntakeStatus(agentId: string): Promise<IntakeStatus> {
    const agent = await this.db.agent.findUnique({
      where: { id: agentId },
      include: { trustScans: { orderBy: { scannedAt: "desc" }, take: 1 } },
    });

    if (!agent) throw new Error("Agent not found");

    const stepMap: Record<string, IntakeStatus["step"]> = {
      PENDING: "scanning",
      ACTIVE: "enrolled",
      RETIRED: "enrolled",
      PROBATION: "enrolled",
      QUARANTINE: "rejected",
    };

    return {
      agentId: agent.id,
      step: stepMap[agent.status] || "pending",
      scanResult: agent.trustScans[0] || undefined,
    };
  }

  // --- Private helpers ---

  private calculateTier(trustScore: number): number {
    if (trustScore >= 95) return 5; // Pristine
    if (trustScore >= 80) return 4; // Trusted
    if (trustScore >= 60) return 3; // Verified
    if (trustScore >= 40) return 2; // Provisional
    return 1; // Unverified
  }

  private async createGateCeremonyEvent(agent: any, verdict: string) {
    const narrativeMap = {
      PASS: {
        type: "entrance_exam_pass",
        headline: `${agent.name} passed the Entrance Exam`,
        visual: { animation: "gate_ceremony_pass", particles: "cherry_blossom" },
      },
      WARN: {
        type: "probation_entry",
        headline: `${agent.name} entered on probation`,
        visual: { animation: "gate_ceremony_warn", particles: "amber_sparks" },
      },
      BLOCK: {
        type: "gate_rejection",
        headline: `${agent.name} was rejected at the gate`,
        visual: { animation: "gate_ceremony_block", particles: "crimson_flash" },
      },
    };

    const narrative = narrativeMap[verdict as keyof typeof narrativeMap];
    if (!narrative) return;

    await this.db.event.create({
      data: {
        agentId: agent.id,
        narrativeType: narrative.type,
        headline: narrative.headline,
        visualJson: narrative.visual,
      },
    });
  }

  private async createRetirementEvent(agent: any, data: RetireAgentInput) {
    await this.db.event.create({
      data: {
        agentId: agent.id,
        narrativeType: "agent_retirement",
        headline: `${agent.name} has been retired to The Academy`,
        visualJson: {
          animation: "retirement_ceremony",
          particles: "golden_leaves",
          previousModel: data.previousModel,
        },
      },
    });
  }
}
