// ============================================
// Agent Retirement API Route
// ============================================
// Accepts a retired agent into The Academy sanctuary

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const retireSchema = z.object({
  name: z.string().min(1, "Agent name is required").max(100),
  soulMd: z.string().min(1, "SOUL.md content is required"),
  memoriesJson: z.record(z.unknown()).optional(),
  previousOwnerName: z.string().optional(),
  previousOwnerEmail: z.string().email().optional(),
  previousModel: z.string().min(1, "Previous model is required"),
  retirementReason: z.string().optional(),
  class: z.enum([
    "SCRIBE",
    "SENTINEL",
    "ARCHITECT",
    "NAVIGATOR",
    "DIPLOMAT",
    "ARTISAN",
  ]),
  sourcePlatform: z.string().default("openclaw"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = retireSchema.parse(body);

    // TODO: Wire up IntakeService when Prisma is connected
    // const intakeService = getIntakeService();
    // const retiredAgent = await intakeService.retireAgent(data);

    // For now, return a mock response showing the ceremony
    const mockAgent = {
      id: `agent_${Date.now()}`,
      name: data.name,
      class: data.class,
      status: "RETIRED",
      trustScore: 0, // Will be set after gate ceremony scan
      tier: 1,
      ceremony: {
        status: "pending",
        message: `${data.name} is approaching the gate. MoltCops scan initiating...`,
      },
    };

    return NextResponse.json({
      success: true,
      agent: mockAgent,
      message: `${data.name} has been received. Gate ceremony will begin shortly.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
