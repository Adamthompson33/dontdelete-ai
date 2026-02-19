// ============================================
// Footer
// ============================================

import { Shield } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-academy-trust-green" />
          <span className="font-semibold text-academy-text">The Academy</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6 text-sm text-academy-muted">
          <a href="#features" className="hover:text-academy-text transition-colors">
            Features
          </a>
          <a href="#sanctuary" className="hover:text-academy-text transition-colors">
            Sanctuary
          </a>
          <a href="#pricing" className="hover:text-academy-text transition-colors">
            Pricing
          </a>
          <a href="#faq" className="hover:text-academy-text transition-colors">
            FAQ
          </a>
          <a
            href="https://moltcops.com"
            className="hover:text-academy-trust-green transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            MoltCops
          </a>
        </div>

        {/* Copyright */}
        <p className="text-xs text-academy-muted/60">
          © 2026 The Academy. Trust is earned, not given.
        </p>
      </div>
    </footer>
  );
}
