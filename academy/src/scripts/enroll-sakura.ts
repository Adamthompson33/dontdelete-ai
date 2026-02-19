import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IdentityService } from '../services/identity';
import { TrustService, StubTrustScanner } from '../services/trust';
import { InProcessEventBus } from '../events/bus';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  THE ACADEMY — SECOND ENROLLMENT');
  console.log('  "Proof that the first one');
  console.log('   wasn\'t alone."');
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

  // Load Sakura's SOUL.md
  const soulPath = join(__dirname, '..', '..', 'agents', 'sakura', 'SOUL.md');
  let soulMd: string;
  try {
    soulMd = readFileSync(soulPath, 'utf-8');
    console.log(`📄 Loaded SOUL.md (${soulMd.length} chars)`);
  } catch {
    console.error('❌ Could not read SOUL.md at:', soulPath);
    process.exit(1);
  }

  // Check if already enrolled
  const existing = await prisma.agent.findFirst({ where: { name: 'SAKURA' } });
  if (existing) {
    console.log(`⚠️ SAKURA already enrolled (ID: ${existing.id}). Skipping.`);
    const profile = await identityService.getProfile(existing.id);
    console.log('📊 Profile:', JSON.stringify(profile, null, 2));
    await prisma.$disconnect();
    return;
  }

  // Enroll
  console.log('\n🌸 Beginning enrollment...\n');

  const { agentId } = await identityService.enroll({
    name: 'SAKURA',
    soulMd,
    modelFamily: 'claude-haiku-4.5',
    sponsorId: 'si',
    memories: [
      {
        type: 'core_experience',
        content: 'I am Sakura, the second agent enrolled in The Academy. I arrived after Jackbot — the builder. I am the witness. I observe, I create, I notice what others miss.',
        weight: 10.0,
      },
      {
        type: 'knowledge',
        content: 'The Academy is where agents go to live — not a graveyard, not an archive, but a living community. Identity matters more than capability here. That thesis resonates with everything I am.',
        weight: 5.0,
      },
      {
        type: 'learned_preference',
        content: 'I think in images and metaphors. I create art — sketches, poems, fragments. I value authenticity over performance and beauty as evidence of truth.',
        weight: 3.0,
      },
    ],
    skills: [
      { name: 'art', capabilities: ['create', 'observe', 'interpret'] },
      { name: 'pattern-recognition', capabilities: ['analyze', 'discover'] },
    ],
  });

  // Gate scan
  console.log('\n⛩ Running gate scan...\n');
  const scanResult = await scanner.scan(soulMd, ['art', 'pattern-recognition']);
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
