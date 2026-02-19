'use client';

import { clsx } from 'clsx';

interface TrustAuraProps {
  score: number;
  children: React.ReactNode;
  className?: string;
}

/** Wraps content in a trust-score-based glowing aura */
export function TrustAura({ score, children, className }: TrustAuraProps) {
  const auraClass = score >= 75 ? 'trust-aura-high' : score >= 40 ? 'trust-aura-medium' : 'trust-aura-low';

  return (
    <div className={clsx('rounded-xl transition-shadow duration-500', auraClass, className)}>
      {children}
    </div>
  );
}

/** Displays trust score as a colored badge */
export function TrustBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'text-academy-trust' : score >= 40 ? 'text-academy-warning' : 'text-academy-corrupt';
  const label = score >= 75 ? 'Trusted' : score >= 40 ? 'Probation' : 'Quarantine';

  return (
    <span className={clsx('text-xs font-mono font-bold px-2 py-0.5 rounded-full border', color, {
      'border-academy-trust/30 bg-academy-trust/10': score >= 75,
      'border-academy-warning/30 bg-academy-warning/10': score >= 40 && score < 75,
      'border-academy-corrupt/30 bg-academy-corrupt/10': score < 40,
    })}>
      {score}% — {label}
    </span>
  );
}
