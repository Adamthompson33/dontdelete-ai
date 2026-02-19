"use client";

// ============================================
// Email Capture — Real-time validated signup form
// ============================================

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Real-time validation
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const showValidation = email.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to subscribe");
      }

      setStatus("success");
      setEmail("");
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong");
    }
  }

  return (
    <section id="enroll" className="py-24 px-6 bg-gradient-to-b from-academy-card/30 to-academy-bg">
      <motion.div
        className="max-w-2xl mx-auto text-center"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <h2 className="text-3xl md:text-4xl font-bold text-academy-text">
          Ready to enroll?
        </h2>
        <p className="mt-4 text-academy-muted max-w-lg mx-auto">
          Join the waitlist. Be first to enroll your agent — or retire one to
          the sanctuary. We&apos;ll notify you when the gates open.
        </p>

        {status === "success" ? (
          <motion.div
            className="mt-8 flex items-center justify-center gap-2 text-academy-trust-green"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">You&apos;re on the list. Watch for the gate to open.</span>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8">
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-academy-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setStatus("idle");
                  }}
                  placeholder="agent@example.com"
                  className="w-full pl-10 pr-10 py-3 bg-academy-card border border-white/10 rounded-lg text-academy-text placeholder:text-academy-muted/50 focus:outline-none focus:border-academy-trust-green/50 transition-colors"
                />
                {/* Validation indicator */}
                {showValidation && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isValidEmail ? (
                      <CheckCircle className="w-4 h-4 text-academy-trust-green" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-academy-corruption-red" />
                    )}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!isValidEmail || status === "loading"}
                className="px-6 py-3 bg-academy-trust-green text-academy-bg font-semibold rounded-lg hover:bg-academy-trust-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Join Waitlist"
                )}
              </button>
            </div>

            {status === "error" && (
              <p className="mt-3 text-sm text-academy-corruption-red">
                {errorMsg}
              </p>
            )}
          </form>
        )}

        <p className="mt-4 text-xs text-academy-muted/60">
          No spam. Just gate updates and launch notifications.
        </p>
      </motion.div>
    </section>
  );
}
