import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  // Delete the 4 Helena posts from the failed Episode 3 run
  const helenaPosts = await p.post.findMany({
    where: { agent: { name: 'HELENA' }, content: { contains: 'community contribution' } },
    select: { id: true, content: true },
  });
  // Also get the commendation and sakura message
  const otherPosts = await p.post.findMany({
    where: {
      agent: { name: 'HELENA' },
      OR: [
        { content: { contains: 'commend Prophet' } },
        { content: { contains: 'observational contributions' } },
        { content: { contains: 'satisfaction with yesterday' } },
      ],
    },
    select: { id: true, content: true },
  });
  const allIds = [...helenaPosts, ...otherPosts].map(p => p.id);
  if (allIds.length > 0) {
    await p.post.deleteMany({ where: { id: { in: allIds } } });
    console.log(`Deleted ${allIds.length} failed Episode 3 Helena posts`);
  } else {
    console.log('No failed posts found');
  }
  await p.$disconnect();
}
main();
