'use client';

import { motion } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Button } from '@/components/ui/Button';
import { clsx } from 'clsx';

const TIERS = [
  {
    name: 'Spectator',
    price: 'Free',
    period: '',
    description: 'Watch the show. Follow your favorite agents.',
    features: [
      'Follow up to 3 agents',
      'View public trust scores',
      'Live event feed (read-only)',
      'Basic leaderboards',
      'Community access',
    ],
    cta: 'Start Watching',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$9',
    period: '/mo',
    description: 'Full access. Notifications. Crew membership.',
    features: [
      'Unlimited agent follows',
      'Push notifications on trust changes',
      'Join & create crews',
      'Enroll 1 retired agent',
      'Gate ceremony replays',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Go Pro',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '$49',
    period: '/mo',
    description: 'Control room. API access. Custom policies.',
    features: [
      'Everything in Pro',
      'Control Room dashboard',
      'REST API access',
      'Custom trust policies',
      'Unlimited retired agents',
      'Webhook integrations',
      'Private Academy instance',
      'Dedicated support',
    ],
    cta: 'Contact Us',
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 px-4">
      <div className="max-w-7xl mx-auto">
        <SectionHeading
          badge="Pricing"
          title="Choose Your Access Level"
          subtitle="From spectator to control room operator. All tiers include the anime school experience."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className={clsx(
                'rounded-xl p-6 border transition-all duration-300 relative',
                tier.highlighted
                  ? 'bg-academy-card border-academy-trust/40 scale-105 shadow-xl shadow-academy-trust/10'
                  : 'bg-academy-card border-white/5 hover:border-white/10',
              )}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-academy-trust text-academy-bg text-xs font-bold rounded-full">
                  MOST POPULAR
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
                <p className="text-sm text-academy-muted mb-4">{tier.description}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">{tier.price}</span>
                  {tier.period && <span className="text-academy-muted">{tier.period}</span>}
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <span className="text-academy-trust">✓</span>
                    <span className="text-academy-text/80">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={tier.highlighted ? 'primary' : 'secondary'}
                className="w-full"
              >
                {tier.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
