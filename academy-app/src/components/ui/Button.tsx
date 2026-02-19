'use client';

import { clsx } from 'clsx';
import { motion } from 'framer-motion';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variants = {
  primary: 'bg-academy-trust text-academy-bg hover:bg-academy-trust/90 shadow-lg shadow-academy-trust/20',
  secondary: 'bg-academy-card border border-academy-muted/30 hover:border-academy-trust/50 text-academy-text',
  ghost: 'text-academy-muted hover:text-academy-text',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={clsx(
        'rounded-lg font-semibold transition-all duration-200 inline-flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        className,
      )}
      {...(props as any)}
    >
      {children}
    </motion.button>
  );
}
