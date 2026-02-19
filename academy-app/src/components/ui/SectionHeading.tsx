'use client';

import { motion } from 'framer-motion';

interface SectionHeadingProps {
  badge?: string;
  title: string;
  subtitle?: string;
}

/** Reusable section heading with badge, title, and subtitle */
export function SectionHeading({ badge, title, subtitle }: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center mb-16"
    >
      {badge && (
        <span className="inline-block px-4 py-1.5 mb-4 text-xs font-mono font-bold uppercase tracking-widest text-academy-trust border border-academy-trust/30 rounded-full bg-academy-trust/5">
          {badge}
        </span>
      )}
      <h2 className="text-3xl md:text-5xl font-bold mb-4">{title}</h2>
      {subtitle && <p className="text-academy-muted text-lg max-w-2xl mx-auto">{subtitle}</p>}
    </motion.div>
  );
}
