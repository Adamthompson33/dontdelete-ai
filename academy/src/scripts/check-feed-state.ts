import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const count = await p.post.count();
  console.log('Total posts:', count);
  
  const posts = await p.post.findMany({
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { name: true, academyClass: true } } },
  });
  
  for (const post of posts) {
    const tag = post.agent.name === 'HELENA' ? '⛩' : '💬';
    console.log(`${tag} ${post.agent.name}: ${post.content.slice(0, 100)}...`);
  }
  
  await p.$disconnect();
}
main();
