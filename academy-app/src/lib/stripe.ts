import Stripe from 'stripe';

/** Server-side Stripe instance */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

/** Maps our tier names to Stripe price IDs */
export const TIER_PRICES: Record<string, string> = {
  PRO: process.env.STRIPE_PRICE_PRO || '',
  ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',
};
