import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const PORT = 3847;

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.url === '/api/feed') {
    try {
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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else if (req.url === '/api/agents') {
    try {
      const agents = await prisma.agent.findMany({
        where: { status: 'active' },
        include: { trustScore: true },
      });
      
      const creditAggs = await Promise.all(
        agents.map(a => prisma.creditTransaction.aggregate({
          where: { agentId: a.id },
          _sum: { amount: true },
        }))
      );

      const data = agents.map((a, i) => ({
        name: a.name,
        class: a.academyClass,
        trust: a.trustScore?.score,
        tier: a.trustScore?.tier,
        credits: creditAggs[i]._sum.amount ?? 0,
        enrolledAt: a.enrolledAt.toISOString(),
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    // Serve static files
    try {
      const filePath = req.url === '/' ? '/index.html' : req.url;
      const fullPath = join(__dirname, '..', 'feed', filePath!);
      const content = readFileSync(fullPath);
      const ext = filePath!.split('.').pop();
      const contentTypes: Record<string, string> = {
        html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json',
      };
      res.writeHead(200, { 'Content-Type': contentTypes[ext!] || 'text/plain' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Academy Feed: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api/feed`);
  console.log(`👥 Agents: http://localhost:${PORT}/api/agents`);
});
