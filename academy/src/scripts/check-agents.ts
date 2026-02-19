import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const agents = await prisma.agent.findMany();
  console.log(JSON.stringify(agents.map(a => ({ id: a.id, name: a.name, class: a.academyClass, status: a.status })), null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
