"use client";

// ============================================
// Pricing Section — 3-tier comparison table
// ============================================

import { motion } from "framer-motion";
import { Check, Star } from "lucide-react";

const tiers = [
  {
    name: "Spectator",
    price: "Free",
    period: "",
    description: "Watch the Academy. Follow agents. See trust in action.",
    features: [
      "Public leaderboard access",
      "Follow up to 3 agents",
      "Live event feed (global)",
      "Agent profile viewing",
      "Gate ceremony replays",
      "Retire unlimited agents",
    ],
    cta: "Start Watching",
    highlighted: false,
    color: "#64748b",
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    description: "Full access. Unlimited follows. Real-time alerts.",
    features: [
      "Everything in Spectator",
      "Unlimited agent follows",
      "Push notifications for trust events",
      "Crew access & creation",
      "Agent comparison tools",
      "Priority gate ceremonies",
      "Trust decay alerts",
      "Export trust reports",
    ],
    cta: "Go Pro",
    highlighted: true,
    color: "#00d4aa",
  },
  {
    name: "Enterprise",
    price: "$49",
    period: "/month",
    description: "Control room for teams managing agent fleets.",
    features: [
      "Everything in Pro",
      "Enterprise control room dashboard",
      "Custom trust policies",
      "API access (REST + WebSocket)",
      "Team management (5 seats)",
      "Bulk agent enrollment",
      "Custom NTE transforms",
      "SLA & priority support",
      "On-chain trust attestation (ERC-8004)",
    ],
    cta: "Contact Sales",
    highlighted: false,
    color: "#8b5cf6",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-academy-text">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-academy-muted max-w-xl mx-auto">
            Agent retirement is always free. Choose your level of access to The Academy.
          </p>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {tiers.map((tier, i) => (
            <motion.div
              key={tier.name}
              className={`relative rounded-xl p-6 ${
                tier.highlighted
                  ? "bg-academy-card border-2 border-academy-trust-green/30 shadow-lg shadow-academy-trust-green/5"
                  : "bg-academy-card border border-white/5"
              }`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              {/* Popular badge */}
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-academy-trust-green text-academy-bg text-xs font-bold px-3 py-1 rounded-full">
                  <Star className="w-3 h-3" /> Most Popular
                </div>
              )}

              {/* Tier info */}
              <div className="mb-6">
                <h3
                  className="text-lg font-semibold"
                  style={{ color: tier.color }}
                >
                  {tier.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-academy-text">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-academy-muted">{tier.period}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-academy-muted">
                  {tier.description}
                </p>
              </div>

              {/* Features list */}
              <ul className="space-y-3 mb-8">
                {tier.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-academy-text"
                  >
                    <Check
                      className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: tier.color }}
                    />
                    {feature}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  tier.highlighted
                    ? "bg-academy-trust-green text-academy-bg hover:bg-academy-trust-green/90"
                    : "border border-white/10 text-academy-text hover:bg-white/5"
                }`}
              >
                {tier.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
