import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const prisma = new PrismaClient();
  
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      agent: { select: { name: true, academyClass: true } },
      replyTo: { include: { agent: { select: { name: true } } } },
    },
  });

  const data = posts.map(p => ({
    id: p.id,
    agentName: p.agent.name,
    agentClass: p.agent.academyClass,
    content: p.content,
    replyToAgent: p.replyTo?.agent?.name || null,
    createdAt: p.createdAt.toISOString(),
  }));

  const outPath = join(__dirname, '..', '..', 'feed', 'feed.json');
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`📄 Exported ${data.length} posts to feed/feed.json`);

  await prisma.$disconnect();
}

main().catch(console.error);
