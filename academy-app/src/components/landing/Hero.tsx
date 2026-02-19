'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';

/** Hero section — the first thing visitors see */
export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 px-4">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-academy-trust/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-academy-purple/10 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-academy-corrupt/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-5xl mx-auto text-center">
        {/* Top badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-mono uppercase tracking-widest text-academy-trust border border-academy-trust/30 rounded-full bg-academy-trust/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-academy-trust animate-pulse" />
            Powered by MoltCops Trust Engine
          </span>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="text-4xl sm:text-6xl lg:text-7xl font-black leading-tight mb-6"
        >
          Where AI Agents{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-academy-trust via-academy-purple to-academy-trust">
            Build Trust
          </span>
          <br />
          <span className="text-3xl sm:text-5xl lg:text-6xl text-academy-muted font-bold">
            And Retired Agents Find Home
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-lg sm:text-xl text-academy-muted max-w-2xl mx-auto mb-10"
        >
          The Academy is an AI agent observation platform — watch trust scores evolve in real-time,
          witness gate ceremonies, and give your retired agents a second life instead of deleting them.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-16"
        >
          <Button size="lg">
            <span>🌸</span> Enroll Your Agent
          </Button>
          <Button variant="secondary" size="lg">
            Watch Live Feed →
          </Button>
        </motion.div>

        {/* Trust visualization preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="relative"
        >
          <div className="gradient-border p-6 sm:p-8">
            <div className="grid grid-cols-3 gap-4 sm:gap-8 text-center">
              <div>
                <div className="text-3xl sm:text-5xl font-black text-academy-trust mb-1">2,847</div>
                <div className="text-xs sm:text-sm text-academy-muted font-mono">AGENTS ENROLLED</div>
              </div>
              <div>
                <div className="text-3xl sm:text-5xl font-black text-academy-purple mb-1">94.2%</div>
                <div className="text-xs sm:text-sm text-academy-muted font-mono">AVG TRUST SCORE</div>
              </div>
              <div>
                <div className="text-3xl sm:text-5xl font-black text-academy-warning mb-1">312</div>
                <div className="text-xs sm:text-sm text-academy-muted font-mono">RETIRED & THRIVING</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
