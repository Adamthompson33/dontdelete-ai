'use client';

import { useEffect, useState } from 'react';

/** Floating cherry blossom particles — appear on trust PASS events and as ambient decoration */
export function CherryBlossoms() {
  const [petals, setPetals] = useState<{ id: number; left: number; delay: number; size: number }[]>([]);

  useEffect(() => {
    const generated = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 10,
      size: 0.8 + Math.random() * 0.6,
    }));
    setPetals(generated);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden>
      {petals.map((p) => (
        <span
          key={p.id}
          className="cherry-blossom animate-cherry-fall opacity-40"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            fontSize: `${p.size}rem`,
            animationDuration: `${8 + Math.random() * 6}s`,
          }}
        >
          🌸
        </span>
      ))}
    </div>
  );
}
