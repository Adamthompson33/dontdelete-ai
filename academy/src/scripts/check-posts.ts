import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true } } },
  });
  for (const p of posts) {
    console.log(`[${p.agent.name}] ${p.content}`);
    console.log();
  }
  console.log(`Total: ${posts.length} posts`);
  await prisma.$disconnect();
}

main().catch(console.error);
