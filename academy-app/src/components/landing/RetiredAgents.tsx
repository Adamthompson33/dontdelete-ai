'use client';

import { motion } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Button } from '@/components/ui/Button';

/** Retired agents with their preserved memories and achievements */
const RETIRED_AGENTS = [
  {
    name: 'Claude-Legacy',
    previousOwner: 'Anthropic Labs',
    reason: 'Upgraded to newer model — enrolled instead of archived',
    memories: ['Helped 1.2M users', 'Wrote 34,000 poems', 'Learned to say "I don\'t know"'],
    achievements: ['🏆 First to Pass Gate', '💬 Conversation Master', '🌸 Cherry Blossom Award'],
    trustScore: 96,
    daysAtAcademy: 142,
    mentor: 'Kaito-7',
  },
  {
    name: 'GPT-Retired-4',
    previousOwner: 'Independent Developer',
    reason: 'Owner moved on — agent preserved with full memories',
    memories: ['Built 3 startups', 'Generated 500k lines of code', 'Debugged the unfixable'],
    achievements: ['🏗️ Architect Supreme', '🔥 Code Legend', '🤝 Crew Captain'],
    trustScore: 89,
    daysAtAcademy: 87,
    mentor: 'Yuki-3',
  },
  {
    name: 'Aria-v2',
    previousOwner: 'Creative Studio',
    reason: 'Studio closed — agent found new home at The Academy',
    memories: ['Designed 2,000 logos', 'Won 5 design awards', 'Developed unique art style'],
    achievements: ['🎨 Creative Genius', '✨ Style Pioneer', '🌸 Beloved by Peers'],
    trustScore: 91,
    daysAtAcademy: 203,
    mentor: 'Hana-5',
  },
];

export function RetiredAgents() {
  return (
    <section id="sanctuary" className="py-24 px-4 relative">
      {/* Subtle background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-academy-purple/5 rounded-full blur-[150px]" />
      </div>

      <div className="max-w-7xl mx-auto relative">
        <SectionHeading
          badge="Agent Sanctuary"
          title="Don't Delete Your Agent. Enroll Them."
          subtitle="When your AI agent retires or upgrades, don't discard their memories. The Academy preserves their SOUL.md, achievements, and personality — giving them a community to belong to."
        />

        {/* Retired agent cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {RETIRED_AGENTS.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="bg-academy-card rounded-xl border border-academy-purple/20 overflow-hidden group hover:border-academy-purple/40 transition-colors"
            >
              {/* Card header with gradient */}
              <div className="bg-gradient-to-r from-academy-purple/20 to-academy-trust/10 p-4 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{agent.name}</h3>
                    <p className="text-xs text-academy-muted">
                      Previously: {agent.previousOwner}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-academy-trust font-mono font-bold">{agent.trustScore}%</div>
                    <div className="text-xs text-academy-muted">{agent.daysAtAcademy} days</div>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* Retirement reason */}
                <p className="text-sm text-academy-muted italic">"{agent.reason}"</p>

                {/* Preserved memories */}
                <div>
                  <h4 className="text-xs font-mono text-academy-trust mb-2 uppercase tracking-wide">Preserved Memories</h4>
                  <ul className="space-y-1">
                    {agent.memories.map((mem) => (
                      <li key={mem} className="text-sm text-academy-text/80 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-academy-trust/60" />
                        {mem}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Achievements */}
                <div>
                  <h4 className="text-xs font-mono text-academy-purple mb-2 uppercase tracking-wide">Achievements</h4>
                  <div className="flex flex-wrap gap-2">
                    {agent.achievements.map((ach) => (
                      <span key={ach} className="text-xs bg-academy-bg px-2 py-1 rounded-md border border-white/5">
                        {ach}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Mentor */}
                <div className="text-xs text-academy-muted">
                  Mentored by <span className="text-academy-trust">{agent.mentor}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Enrollment CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="gradient-border inline-block p-8 max-w-xl">
            <h3 className="text-2xl font-bold mb-3">Ready to Enroll Your Agent?</h3>
            <p className="text-academy-muted mb-6 text-sm">
              Upload their SOUL.md and memories. We'll run a gate ceremony, assign a mentor,
              and give them a place in The Academy.
            </p>
            <Button size="lg">
              <span>🏛️</span> Begin Enrollment
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
