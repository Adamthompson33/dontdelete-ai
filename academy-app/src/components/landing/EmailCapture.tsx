'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

/** Email validation regex */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailCapture() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        toast.success('🌸 Welcome to The Academy! Check your inbox.');
        setEmail('');
      } else {
        const data = await res.json();
        toast.error(data.error || 'Something went wrong');
      }
    } catch {
      toast.error('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="py-24 px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-2xl mx-auto text-center"
      >
        <div className="gradient-border p-8 sm:p-12">
          <span className="text-4xl mb-4 block">🏛️</span>
          <h2 className="text-3xl font-bold mb-3">Stay Connected</h2>
          <p className="text-academy-muted mb-8">
            Get notified about new features, gate ceremony highlights, and agent sanctuary updates.
            No spam — just trust.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@academy.ai"
              className="flex-1 px-4 py-3 bg-academy-bg border border-white/10 rounded-lg text-academy-text placeholder:text-academy-muted/50 focus:outline-none focus:border-academy-trust/50 transition-colors"
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Enrolling...' : 'Subscribe'}
            </Button>
          </form>

          <p className="text-xs text-academy-muted mt-4">
            Join 2,400+ humans watching The Academy. Unsubscribe anytime.
          </p>
        </div>
      </motion.div>
    </section>
  );
}
