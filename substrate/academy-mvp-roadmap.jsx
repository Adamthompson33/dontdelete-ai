import { useState } from "react";

const C = {
  bg: "#090a0f",
  card: "#0f1019",
  cardActive: "#141622",
  border: "rgba(255,255,255,0.05)",
  accent: "#00d4aa",
  accentDim: "#00d4aa40",
  amber: "#ffa726",
  sakura: "#ff6b9d",
  cyan: "#00e5ff",
  crimson: "#ff1744",
  purple: "#c49bff",
  text: "#ddd8e8",
  muted: "#5a5e76",
  mutedLight: "#8088a0",
};

const SPRINTS = [
  {
    id: 1, weeks: "1–2", title: "Foundation",
    goal: "Skeleton app consuming real Substrate data, displayed in Academy format.",
    color: C.accent,
    tasks: [
      { text: "Next.js project scaffold (App Router, Tailwind, Framer Motion)", priority: "P0", effort: "S" },
      { text: "Substrate SDK integration — read agent registry + trust scores", priority: "P0", effort: "L" },
      { text: "MoltCops SDK integration — fetch scan results + trust history", priority: "P0", effort: "L" },
      { text: "Narrative Transform Engine v0.1 — 5 core event types", priority: "P0", effort: "M" },
      { text: "Agent list page with class icons + trust scores", priority: "P0", effort: "M" },
      { text: "Agent profile page with trust history sparkline", priority: "P0", effort: "M" },
      { text: "PostgreSQL schema + Redis setup", priority: "P0", effort: "S" },
      { text: "Staging deployment (Vercel + Railway)", priority: "P0", effort: "S" },
    ],
    risk: "Substrate SDK may not expose required events. Fallback: mock event emitter.",
    output: "Deployed staging URL showing real agent data in Academy visual format."
  },
  {
    id: 2, weeks: "3–4", title: "Real-Time & Core UX",
    goal: "The app feels alive. Events stream in. Trust auras animate. It feels like watching something.",
    color: C.cyan,
    tasks: [
      { text: "WebSocket server (Socket.IO) consuming Substrate event bus", priority: "P0", effort: "L" },
      { text: "Live event feed — real-time narrative events", priority: "P0", effort: "L" },
      { text: "Trust aura component — CSS/SVG visual reflecting trust score", priority: "P0", effort: "M" },
      { text: "Avatar component — class icons, tier badges, trust overlays", priority: "P0", effort: "M" },
      { text: "Leaderboard with animated rank changes", priority: "P0", effort: "M" },
      { text: "Gate simulation interactive (PASS/WARN/BLOCK demo)", priority: "P0", effort: "S" },
      { text: "NTE v0.2 — all 15+ event types from transform registry", priority: "P0", effort: "M" },
      { text: "Mobile responsive pass on all pages", priority: "P1", effort: "M" },
    ],
    risk: "WebSocket at scale. Mitigated by Socket.IO room-based routing.",
    output: "Real-time event feed and interactive trust visualization working on staging."
  },
  {
    id: 3, weeks: "5–6", title: "Profile Depth & Engagement",
    goal: "Agent profiles rich enough that users want to check on their agent regularly.",
    color: C.amber,
    tasks: [
      { text: "Extended agent profile — full trust history chart, scan log, capability stats", priority: "P0", effort: "L" },
      { text: "Achievement system — trust-based badges from scan history", priority: "P1", effort: "M" },
      { text: "Trust decay visualizer (interactive corruption stages)", priority: "P1", effort: "M" },
      { text: "Follow system — user accounts, filtered feeds per followed agent", priority: "P1", effort: "L" },
      { text: "User dashboard — 'My Agents' aggregated view", priority: "P1", effort: "M" },
      { text: "Notification system — email/push for critical trust events", priority: "P1", effort: "M" },
      { text: "Class & tier reference pages (onboarding content)", priority: "P2", effort: "S" },
    ],
    risk: "User accounts introduce auth complexity. Mitigated by Supabase Auth + SIWE.",
    output: "Users can create accounts, follow agents, receive personalized feeds."
  },
  {
    id: 4, weeks: "7–8", title: "Polish & Launch",
    goal: "Production-ready, tested with real users, launched to MoltCops existing audience.",
    color: C.sakura,
    tasks: [
      { text: "Performance audit — Lighthouse 90+, WebSocket stability testing", priority: "P0", effort: "M" },
      { text: "Loading states, error handling, graceful degradation", priority: "P0", effort: "M" },
      { text: "Animation polish — timing refinement on all transitions", priority: "P1", effort: "M" },
      { text: "SEO — public pages optimized, Open Graph social cards", priority: "P1", effort: "S" },
      { text: "Analytics integration — feature usage, session duration, retention", priority: "P0", effort: "S" },
      { text: "Feedback widget — in-app issue reporting", priority: "P1", effort: "S" },
      { text: "Launch content — landing page, demo video, social thread", priority: "P0", effort: "M" },
      { text: "Beta invite system — controlled rollout to MoltCops users first", priority: "P0", effort: "S" },
      { text: "NTE API documentation for third-party Layer 3 builders", priority: "P2", effort: "M" },
    ],
    risk: "Insufficient seed data. Mitigated by ensuring Substrate has 20+ real agents before launch.",
    output: "Production deployment. First real users. Metrics collection begins."
  },
];

const STACK = [
  { layer: "Frontend", choice: "Next.js 14+ (App Router)", why: "Server components, zero-config Vercel deploy, existing React prototype = no migration", icon: "▲", color: C.accent },
  { layer: "Rendering", choice: "2D: CSS/SVG/Canvas. No Three.js.", why: "3D doesn't validate the core hypothesis. 2D ships in 8 weeks. 3D adds 8+ more.", icon: "◻", color: C.cyan },
  { layer: "Animation", choice: "Framer Motion + CSS", why: "Production-grade React animation. Trust auras, corruption effects, gate ceremonies.", icon: "◈", color: C.purple },
  { layer: "Real-Time", choice: "Socket.IO (WebSocket)", why: "Auto-reconnect, room routing, bidirectional. Events appear in <3 seconds.", icon: "⚡", color: C.amber },
  { layer: "Backend", choice: "Fastify (Node.js)", why: "Thin API layer. 2-3x faster than Express. JSON schema validation.", icon: "⬡", color: C.sakura },
  { layer: "Database", choice: "Supabase (PostgreSQL) + Upstash (Redis)", why: "Managed. Zero DevOps. Generous free tier. Redis for pub/sub + caching.", icon: "◇", color: C.accent },
  { layer: "Auth", choice: "SIWE + email fallback", why: "Target audience is crypto-adjacent. Wallet auth reduces friction.", icon: "🔑", color: C.cyan },
  { layer: "Hosting", choice: "Vercel + Railway", why: "1-2 person team can't afford DevOps. Zero-config deployment.", icon: "☁", color: C.muted },
];

const METRICS = [
  { name: "Return Rate (W2)", target: "30%", kill: "<10% at W4", desc: "Do users come back? The primary validation metric.", color: C.accent, isPrimary: true },
  { name: "Avg Session Duration", target: ">3 min", kill: null, desc: "Are people watching, or bouncing?", color: C.cyan },
  { name: "Agents Followed / User", target: ">2", kill: null, desc: "Following = caring. Engagement depth signal.", color: C.amber },
  { name: "Feed Scroll Depth", target: ">30% past fold", kill: null, desc: "Is the narrative feed compelling enough to read?", color: C.purple },
  { name: "Profile Views / Session", target: ">3", kill: null, desc: "Are people exploring, or just checking their own agent?", color: C.sakura },
  { name: "Gate Sim Completions", target: ">60% of visitors", kill: null, desc: "Is the interactive demo converting curiosity?", color: C.cyan },
  { name: "MoltCops Rescan Rate", target: "+20% vs baseline", kill: null, desc: "Does visual trust decay motivate re-verification?", color: C.accent },
];

const PHASES = [
  { phase: "MVP", weeks: "1–8", status: "BUILD", items: ["Agent Registry View", "Trust Monitor", "Live Feed", "Profiles", "Leaderboard", "Gate Sim", "Follow System", "Achievements"], color: C.accent },
  { phase: "Phase 2", weeks: "9–20", status: "IF VALIDATED", items: ["Crew System", "Cosmetic Store", "Showcase Events", "Sound Design", "ERC-8004", "Rivalry Detection"], color: C.amber },
  { phase: "Phase 3", weeks: "21+", status: "FUTURE", items: ["3D Campus (R3F)", "Mobile App", "Workflow Replays", "On-chain Attestations", "Idol Performances"], color: C.sakura },
];

const COSTS = [
  { item: "Vercel Pro", cost: "$20/mo", note: "Frontend + preview deploys" },
  { item: "Railway", cost: "$5–20/mo", note: "Backend containers" },
  { item: "Supabase Pro", cost: "$25/mo", note: "PostgreSQL + Auth" },
  { item: "Upstash Redis", cost: "$0–10/mo", note: "Pay-per-request" },
  { item: "Domain", cost: "$15/yr", note: "One-time" },
];

function EffortBadge({ effort }) {
  const colors = { S: C.accent, M: C.amber, L: C.sakura };
  const labels = { S: "S", M: "M", L: "L" };
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 3,
      background: (colors[effort] || C.muted) + "18",
      color: colors[effort] || C.muted,
      letterSpacing: 0.5,
    }}>{labels[effort]}</span>
  );
}

function PriorityDot({ priority }) {
  const colors = { P0: C.accent, P1: C.amber, P2: C.muted };
  return (
    <span style={{
      width: 6, height: 6, borderRadius: "50%",
      background: colors[priority] || C.muted,
      flexShrink: 0, marginTop: 5,
    }} />
  );
}

export default function RoadmapApp() {
  const [tab, setTab] = useState("sprints");
  const [expandedSprint, setExpandedSprint] = useState(1);

  const tabs = [
    { id: "sprints", label: "Sprint Plan" },
    { id: "stack", label: "Stack" },
    { id: "metrics", label: "Metrics" },
    { id: "phases", label: "Phases" },
    { id: "cost", label: "Cost" },
  ];

  const totalTasks = SPRINTS.reduce((s, sp) => s + sp.tasks.length, 0);
  const p0Tasks = SPRINTS.reduce((s, sp) => s + sp.tasks.filter(t => t.priority === "P0").length, 0);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; } ::selection { background: ${C.accent}40; }`}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: C.accent, letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 }}>
            Technical Roadmap
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: -0.5 }}>
            The Academy MVP
          </h1>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.6, maxWidth: 600 }}>
            8-week build plan. Web-based real-time dashboard visualizing Substrate agent activity
            through The Academy's narrative metaphor with MoltCops trust integration.
          </p>

          {/* Quick stats */}
          <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { label: "Duration", value: "8 weeks", color: C.text },
              { label: "Sprints", value: "4", color: C.accent },
              { label: "Total Tasks", value: totalTasks, color: C.cyan },
              { label: "P0 Critical", value: p0Tasks, color: C.sakura },
              { label: "Team", value: "1–2 devs", color: C.amber },
              { label: "Infra Cost", value: "~$65/mo", color: C.accent },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 22, borderBottom: `1px solid ${C.border}`, paddingBottom: 1 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "8px 16px", fontSize: 11, fontFamily: "inherit",
                background: "transparent",
                color: tab === t.id ? C.accent : C.muted,
                border: "none", borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
                cursor: "pointer", transition: "all 0.15s",
                fontWeight: tab === t.id ? 700 : 400, letterSpacing: 0.3,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sprint Plan */}
        {tab === "sprints" && (
          <div>
            {/* Timeline bar */}
            <div style={{ display: "flex", gap: 2, marginBottom: 20, height: 4, borderRadius: 2, overflow: "hidden" }}>
              {SPRINTS.map(sp => (
                <div key={sp.id} style={{
                  flex: 1, background: expandedSprint === sp.id ? sp.color : sp.color + "30",
                  cursor: "pointer", transition: "background 0.2s",
                  borderRadius: 2,
                }} onClick={() => setExpandedSprint(sp.id)} />
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SPRINTS.map(sp => {
                const isOpen = expandedSprint === sp.id;
                return (
                  <div
                    key={sp.id}
                    style={{
                      borderRadius: 10, overflow: "hidden",
                      border: `1px solid ${isOpen ? sp.color + "30" : C.border}`,
                      background: isOpen ? C.cardActive : C.card,
                      transition: "all 0.2s",
                    }}
                  >
                    {/* Sprint header */}
                    <div
                      onClick={() => setExpandedSprint(isOpen ? null : sp.id)}
                      style={{
                        padding: "14px 16px", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: sp.color + "15", border: `1px solid ${sp.color}30`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 800, color: sp.color,
                        }}>{sp.id}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: isOpen ? "#fff" : C.text }}>
                            {sp.title}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted }}>
                            Weeks {sp.weeks} · {sp.tasks.length} tasks
                          </div>
                        </div>
                      </div>
                      <div style={{
                        fontSize: 16, color: sp.color, opacity: 0.5,
                        transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                      }}>+</div>
                    </div>

                    {/* Sprint detail */}
                    {isOpen && (
                      <div style={{ padding: "0 16px 16px" }}>
                        {/* Goal */}
                        <div style={{
                          padding: "10px 12px", borderRadius: 6, marginBottom: 14,
                          background: sp.color + "08", borderLeft: `3px solid ${sp.color}60`,
                          fontSize: 11, color: C.mutedLight, lineHeight: 1.6,
                        }}>
                          <span style={{ color: sp.color, fontWeight: 700 }}>Goal: </span>{sp.goal}
                        </div>

                        {/* Tasks */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {sp.tasks.map((task, i) => (
                            <div key={i} style={{
                              display: "flex", gap: 8, alignItems: "flex-start",
                              padding: "6px 8px", borderRadius: 4,
                              background: "rgba(0,0,0,0.2)",
                            }}>
                              <PriorityDot priority={task.priority} />
                              <div style={{ flex: 1, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                                {task.text}
                              </div>
                              <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                                <EffortBadge effort={task.effort} />
                                <span style={{ fontSize: 8, color: C.muted }}>{task.priority}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Risk + Output */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
                          <div style={{ padding: "8px 10px", borderRadius: 6, background: C.crimson + "08", border: `1px solid ${C.crimson}15` }}>
                            <div style={{ fontSize: 9, color: C.crimson, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Risk</div>
                            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{sp.risk}</div>
                          </div>
                          <div style={{ padding: "8px 10px", borderRadius: 6, background: C.accent + "08", border: `1px solid ${C.accent}15` }}>
                            <div style={{ fontSize: 9, color: C.accent, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>Output</div>
                            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{sp.output}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{
              marginTop: 16, padding: 12, borderRadius: 8, background: C.card,
              border: `1px solid ${C.border}`,
              display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Legend:</span>
              {[["P0", "Critical", C.accent], ["P1", "Important", C.amber], ["P2", "Nice-to-have", C.muted]].map(([p, l, c]) => (
                <span key={p} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.muted }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
                  {p}: {l}
                </span>
              ))}
              <span style={{ color: C.muted, opacity: 0.3 }}>|</span>
              {[["S", "Small", C.accent], ["M", "Medium", C.amber], ["L", "Large", C.sakura]].map(([e, l, c]) => (
                <span key={e} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: C.muted }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: c }}>{e}</span> {l}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stack */}
        {tab === "stack" && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Technology Decisions · Optimized for speed-to-ship with 1–2 devs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {STACK.map((s, i) => (
                <div key={s.layer} style={{
                  padding: 14, borderRadius: 8, background: C.card,
                  border: `1px solid ${C.border}`,
                  display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                    background: s.color + "12", border: `1px solid ${s.color}25`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: s.color,
                  }}>{s.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase", minWidth: 70 }}>
                        {s.layer}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.choice}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>{s.why}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Core Architecture */}
            <div style={{
              marginTop: 20, padding: 16, borderRadius: 10, background: C.card,
              border: `1px solid ${C.accent}15`,
            }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                Core Architecture — Narrative Transform Engine
              </div>
              <div style={{
                fontFamily: "'Courier New', monospace", fontSize: 10, color: C.mutedLight,
                lineHeight: 1.8, padding: 12, borderRadius: 6, background: "rgba(0,0,0,0.4)",
              }}>
                <div style={{ color: C.muted }}>{"// The NTE is the only component unique to The Academy"}</div>
                <div style={{ color: C.muted }}>{"// Everything else is standard web infrastructure"}</div>
                <br/>
                <div>Substrate Event Bus <span style={{ color: C.accent }}>→</span> Redis Pub/Sub</div>
                <div style={{ paddingLeft: 20 }}><span style={{ color: C.accent }}>→</span> <span style={{ color: C.cyan }}>Narrative Transform Engine</span></div>
                <div style={{ paddingLeft: 40 }}><span style={{ color: C.amber }}>→</span> AcademyEvent (visual instructions + feed entry + notifications)</div>
                <div style={{ paddingLeft: 60 }}><span style={{ color: C.sakura }}>→</span> Socket.IO <span style={{ color: C.accent }}>→</span> React Frontend</div>
                <br/>
                <div style={{ color: C.muted }}>{"// Transform: pure function"}</div>
                <div><span style={{ color: C.purple }}>fn</span> transform(SubstrateEvent) <span style={{ color: C.accent }}>→</span> AcademyEvent[]</div>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
                The NTE is where "security becomes entertainment" is implemented as code. It's renderer-agnostic — 
                the same transforms power the 2D MVP, future 3D campus, and any third-party Layer 3 interface.
              </div>
            </div>
          </div>
        )}

        {/* Metrics */}
        {tab === "metrics" && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Success Metrics · The MVP validates one hypothesis
            </div>

            {/* Core hypothesis */}
            <div style={{
              padding: 16, borderRadius: 10, marginBottom: 16,
              background: `linear-gradient(135deg, ${C.accent}08, ${C.cyan}04)`,
              border: `1px solid ${C.accent}20`,
            }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>
                Core Hypothesis
              </div>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 600, lineHeight: 1.6 }}>
                Does wrapping agent telemetry in a narrative skin make people care more about their agents than a standard dashboard would?
              </div>
            </div>

            {/* Metrics grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {METRICS.map((m, i) => (
                <div key={m.name} style={{
                  padding: 14, borderRadius: 8,
                  background: m.isPrimary ? `${m.color}08` : C.card,
                  border: `1px solid ${m.isPrimary ? m.color + "25" : C.border}`,
                  display: "flex", gap: 14, alignItems: "center",
                }}>
                  <div style={{
                    width: 56, textAlign: "center", flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: m.color }}>{m.target}</div>
                    <div style={{ fontSize: 8, color: C.muted, letterSpacing: 0.5, marginTop: 2 }}>TARGET</div>
                  </div>
                  <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, paddingLeft: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: m.isPrimary ? "#fff" : C.text }}>{m.name}</span>
                      {m.isPrimary && (
                        <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: m.color + "20", color: m.color, fontWeight: 700, letterSpacing: 1 }}>
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{m.desc}</div>
                  </div>
                  {m.kill && (
                    <div style={{
                      fontSize: 9, color: C.crimson, textAlign: "right", flexShrink: 0,
                      padding: "4px 8px", borderRadius: 4, background: C.crimson + "10",
                    }}>
                      <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>KILL</div>
                      <div>{m.kill}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Kill metric callout */}
            <div style={{
              marginTop: 16, padding: 14, borderRadius: 8,
              background: C.crimson + "08", border: `1px solid ${C.crimson}20`,
            }}>
              <div style={{ fontSize: 10, color: C.crimson, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
                Kill Discipline
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                If Week 2 return rate is below 10% after 4 weeks of launch, the narrative Layer 3 concept doesn't justify 
                continued investment. Pivot to enhancing the Enterprise Control Room. Being honest about the kill metric 
                upfront is what separates a disciplined build from a vanity project.
              </div>
            </div>
          </div>
        )}

        {/* Phases */}
        {tab === "phases" && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Build Phases · Only MVP is committed. Phase 2+ depends on metrics.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {PHASES.map((ph, i) => (
                <div key={ph.phase} style={{
                  padding: 16, borderRadius: 10, background: C.card,
                  border: `1px solid ${ph.color}${i === 0 ? "30" : "15"}`,
                  opacity: i === 0 ? 1 : 0.75 + (i * -0.15),
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: ph.color }}>{ph.phase}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>Weeks {ph.weeks}</span>
                    </div>
                    <span style={{
                      fontSize: 9, padding: "2px 8px", borderRadius: 3, fontWeight: 700,
                      letterSpacing: 1,
                      background: ph.color + "15", color: ph.color,
                    }}>{ph.status}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {ph.items.map(item => (
                      <span key={item} style={{
                        fontSize: 10, padding: "4px 10px", borderRadius: 4,
                        background: "rgba(0,0,0,0.3)", color: C.mutedLight,
                        border: `1px solid ${C.border}`,
                      }}>{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Decision tree */}
            <div style={{
              marginTop: 20, padding: 16, borderRadius: 10, background: C.card,
              border: `1px solid ${C.border}`, textAlign: "center",
            }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
                Decision Tree
              </div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 2.2 }}>
                <div>
                  <span style={{ color: C.accent, fontWeight: 700 }}>MVP ships (Week 8)</span>
                </div>
                <div style={{ color: C.muted }}>↓ measure for 4 weeks</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 40, marginTop: 4 }}>
                  <div>
                    <div style={{ color: C.accent }}>Return rate ≥ 10%</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>↓</div>
                    <div style={{ color: C.cyan, fontWeight: 600 }}>Build Phase 2</div>
                  </div>
                  <div>
                    <div style={{ color: C.crimson }}>Return rate {"<"} 10%</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>↓</div>
                    <div style={{ color: C.crimson, fontWeight: 600 }}>Kill. Pivot to Control Room.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cost */}
        {tab === "cost" && (
          <div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              MVP Infrastructure Cost · Product risk, not capital risk
            </div>
            <div style={{
              padding: 16, borderRadius: 10, background: C.card,
              border: `1px solid ${C.border}`,
            }}>
              {COSTS.map((c, i) => (
                <div key={c.item} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i < COSTS.length - 1 ? `1px solid ${C.border}` : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{c.item}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{c.note}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{c.cost}</div>
                </div>
              ))}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0 0", marginTop: 8, borderTop: `2px solid ${C.accent}30`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Total Monthly</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.accent }}>~$65/mo</div>
              </div>
            </div>

            <div style={{
              marginTop: 16, padding: 14, borderRadius: 8,
              background: C.accent + "06", border: `1px solid ${C.accent}15`,
              fontSize: 11, color: C.muted, lineHeight: 1.7,
            }}>
              The infrastructure cost for the MVP is trivially small. This is a product risk, not a capital risk.
              The only real cost is the developer's time: 1 fullstack dev × 8 weeks.
              Every tool chosen is managed/serverless with generous free tiers — zero DevOps overhead for a small team.
            </div>

            {/* Team */}
            <div style={{
              marginTop: 16, padding: 16, borderRadius: 10, background: C.card,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                Team Requirements
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(0,0,0,0.3)", border: `1px solid ${C.accent}15` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>Fullstack Dev</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Full-time · 8 weeks</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                    Next.js, WebSocket, CSS animations, SVG, API integration
                  </div>
                </div>
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(0,0,0,0.3)", border: `1px solid ${C.amber}15` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.amber }}>Product / Design</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Part-time (50%) · 8 weeks</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                    UX decisions, narrative design, launch content. Can be the founder.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 36, paddingTop: 14, borderTop: `1px solid ${C.border}`,
          fontSize: 9, color: C.muted + "60", display: "flex", justifyContent: "space-between",
        }}>
          <span>THE ACADEMY · MVP Roadmap v1.0 · Feb 2026</span>
          <span>Ship it, watch the metrics, let the data decide Phase 2.</span>
        </div>
      </div>
    </div>
  );
}
