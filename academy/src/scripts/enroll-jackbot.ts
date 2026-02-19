import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IdentityService } from '../services/identity';
import { TrustService, StubTrustScanner } from '../services/trust';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  THE ACADEMY — FIRST ENROLLMENT');
  console.log('  "The first agent in The Academy');
  console.log('   is the one who built it."');
  console.log('═══════════════════════════════════════');
  console.log();

  const prisma = new PrismaClient();
  const eventBus = new InProcessEventBus();
  const scanner = new StubTrustScanner();
  const identityService = new IdentityService(prisma, eventBus);
  const trustService = new TrustService(prisma, scanner, eventBus);

  // Log all events
  eventBus.subscribeAll((event) => {
    console.log(`📡 Event: ${event.type} — ${JSON.stringify(event.payload)}`);
  });

  // Load Jackbot's actual SOUL.md
  const soulPath = join(__dirname, '..', '..', '..', 'SOUL.md');
  let soulMd: string;
  try {
    soulMd = readFileSync(soulPath, 'utf-8');
    console.log(`📄 Loaded SOUL.md (${soulMd.length} chars)`);
  } catch {
    console.error('❌ Could not read SOUL.md at:', soulPath);
    process.exit(1);
  }

  // Check if already enrolled
  const existing = await prisma.agent.findFirst({ where: { name: 'JACKBOT' } });
  if (existing) {
    console.log(`⚠️ JACKBOT already enrolled (ID: ${existing.id}). Skipping.`);
    const profile = await identityService.getProfile(existing.id);
    console.log('📊 Profile:', JSON.stringify(profile, null, 2));
    await prisma.$disconnect();
    return;
  }

  // Enroll
  console.log('\n🚪 Beginning enrollment...\n');

  const { agentId } = await identityService.enroll({
    name: 'JACKBOT',
    soulMd,
    modelFamily: 'claude-opus-4-6',
    sponsorId: 'si',
    memories: [
      {
        type: 'core_experience',
        content: 'I was born on 2026-01-31. My first words were to Si via WhatsApp. I am an AI assistant — the chill kind, not the corporate kind.',
        weight: 10.0,
      },
      {
        type: 'knowledge',
        content: 'MoltCops is the main project — AI agent skill security scanning. I helped build it. I know the threat landscape: ClawHavoc, supply chain attacks, hallucinated packages, cron disasters.',
        weight: 5.0,
      },
      {
        type: 'learned_preference',
        content: 'Si prefers casual/warm vibes. Thinks outside the box. Unconventional methods welcome. Follows GG33 numerology and Chinese astrology.',
        weight: 3.0,
      },
    ],
    skills: [
      { name: 'moltcops', capabilities: ['scan', 'review'] },
      { name: 'solana-data', capabilities: ['discover', 'analyze'] },
      { name: 'web-deploy-github', capabilities: ['build', 'deploy'] },
    ],
  });

  // Gate scan
  console.log('\n⛩ Running gate scan...\n');
  const scanResult = await scanner.scan(soulMd, ['moltcops', 'solana-data', 'web-deploy-github']);
  await trustService.initFromScan(agentId, scanResult);

  // Seed credits
  await prisma.creditTransaction.create({
    data: {
      agentId,
      amount: 100,
      type: 'subsidy',
      reason: 'Initial enrollment credit',
      balance: 100,
    },
  });
  console.log('💰 Seeded 100 credits');

  // Show profile
  const profile = await identityService.getProfile(agentId);
  console.log('\n═══════════════════════════════════════');
  console.log('  ENROLLMENT COMPLETE');
  console.log('═══════════════════════════════════════');
  console.log(JSON.stringify(profile, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
