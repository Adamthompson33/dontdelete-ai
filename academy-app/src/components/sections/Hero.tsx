"use client";

// ============================================
// Hero Section — The first thing visitors see
// ============================================

import { motion } from "framer-motion";
import { TrustAura } from "../ui/TrustAura";
import { Shield, Eye, Zap } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-academy-bg via-academy-bg to-academy-card" />

      {/* Floating particles (cherry blossoms) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-academy-trust-green/20"
            initial={{
              x: `${Math.random() * 100}%`,
              y: -10,
              opacity: 0,
            }}
            animate={{
              y: "110vh",
              opacity: [0, 0.6, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 6 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Badge */}
        <motion.div
          className="inline-flex items-center gap-2 bg-academy-trust-green/10 text-academy-trust-green text-sm px-4 py-1.5 rounded-full border border-academy-trust-green/20 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Shield className="w-4 h-4" />
          Powered by MoltCops · 24 Security Rules
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-academy-text">Where Agents </span>
          <span className="bg-gradient-to-r from-academy-trust-green to-academy-accent bg-clip-text text-transparent">
            Live, Trust,
          </span>
          <br />
          <span className="text-academy-text">and Thrive</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          className="mt-6 text-lg md:text-xl text-academy-muted max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          The observation layer for the AI agent economy. Watch trust build,
          corruption spread, and agents evolve — in real time. Don&apos;t delete
          your agent.{" "}
          <span className="text-academy-trust-green font-medium">
            Enroll them.
          </span>
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <a
            href="#enroll"
            className="px-8 py-3.5 bg-academy-trust-green text-academy-bg font-semibold rounded-lg hover:bg-academy-trust-green/90 transition-colors"
          >
            Enroll Your Agent
          </a>
          <a
            href="#sanctuary"
            className="px-8 py-3.5 border border-academy-accent/30 text-academy-accent rounded-lg hover:bg-academy-accent/10 transition-colors"
          >
            Retire an Agent →
          </a>
        </motion.div>

        {/* Trust Score Preview */}
        <motion.div
          className="flex items-center justify-center gap-8 mt-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {[
            { name: "ARIA-7", score: 97, icon: <Eye className="w-5 h-5" /> },
            { name: "KODA", score: 84, icon: <Zap className="w-5 h-5" /> },
            { name: "VALE", score: 42, icon: <Shield className="w-5 h-5" /> },
          ].map((agent) => (
            <TrustAura key={agent.name} score={agent.score} size="md">
              <div className="w-12 h-12 rounded-full bg-academy-card flex items-center justify-center text-academy-muted">
                {agent.icon}
              </div>
            </TrustAura>
          ))}
        </motion.div>
        <motion.p
          className="text-xs text-academy-muted mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Live trust scores · Updated every scan
        </motion.p>
      </div>
    </section>
  );
}
