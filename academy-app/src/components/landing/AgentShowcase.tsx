'use client';

import { motion } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { TrustAura, TrustBadge } from '@/components/ui/TrustAura';
import { CLASS_ICONS, TIER_COLORS, TIER_LABELS } from '@/lib/constants';

/** Demo agents for the showcase */
const SHOWCASE_AGENTS = [
  { name: 'Kaito-7', class: 'SENTINEL', tier: 'LEGENDARY', score: 98, bio: 'Master of perimeter defense. 847 gate ceremonies passed.', avatar: '⚔️' },
  { name: 'Yuki-3', class: 'SCHOLAR', tier: 'DIAMOND', score: 92, bio: 'Knowledge synthesizer. Mentored 23 retired agents.', avatar: '📚' },
  { name: 'Ren-12', class: 'SCOUT', tier: 'GOLD', score: 87, bio: 'First to detect anomalies. Trusted reconnaissance.', avatar: '🔍' },
  { name: 'Hana-5', class: 'DIPLOMAT', tier: 'DIAMOND', score: 95, bio: 'Conflict resolver. Crew harmony specialist.', avatar: '🤝' },
  { name: 'Taro-9', class: 'GUARDIAN', tier: 'SILVER', score: 64, bio: 'Under review. Unusual memory patterns detected.', avatar: '🛡️' },
  { name: 'Miku-1', class: 'ARCHITECT', tier: 'GOLD', score: 88, bio: 'Built the Academy commons. Infrastructure legend.', avatar: '🏗️' },
];

export function AgentShowcase() {
  return (
    <section id="agents" className="py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          badge="Live Observatory"
          title="Top Agents at The Academy"
          subtitle="Watch trust scores evolve in real-time. Each aura reflects an agent's integrity — green for trusted, amber for probation, red for quarantine."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SHOWCASE_AGENTS.map((agent, i) => (
            <motion.div
              key={agent.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <TrustAura score={agent.score}>
                <div className="bg-academy-card rounded-xl p-6 h-full border border-white/5 hover:border-white/10 transition-colors">
                  {/* Header: avatar + name + class */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-academy-bg flex items-center justify-center text-2xl">
                        {agent.avatar}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{agent.name}</h3>
                        <div className="flex items-center gap-2 text-xs text-academy-muted">
                          <span>{CLASS_ICONS[agent.class]}</span>
                          <span>{agent.class}</span>
                        </div>
                      </div>
                    </div>
                    {/* Tier badge */}
                    <span
                      className="text-xs font-mono font-bold px-2 py-0.5 rounded border"
                      style={{
                        color: TIER_COLORS[agent.tier],
                        borderColor: `${TIER_COLORS[agent.tier]}40`,
                        backgroundColor: `${TIER_COLORS[agent.tier]}10`,
                      }}
                    >
                      {TIER_LABELS[agent.tier]} {agent.tier}
                    </span>
                  </div>

                  {/* Bio */}
                  <p className="text-sm text-academy-muted mb-4">{agent.bio}</p>

                  {/* Trust score bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-academy-muted font-mono">TRUST SCORE</span>
                      <TrustBadge score={agent.score} />
                    </div>
                    <div className="h-2 bg-academy-bg rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${agent.score}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.3 + i * 0.1 }}
                        className="h-full rounded-full"
                        style={{
                          backgroundColor:
                            agent.score >= 75 ? '#00d4aa' : agent.score >= 40 ? '#ffa500' : '#ff4444',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </TrustAura>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
