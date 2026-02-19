import { useState, useEffect } from "react";

const C = {
  bg: "#0a0b12",
  card: "#111320",
  cardHover: "#161830",
  border: "rgba(255,255,255,0.06)",
  sakura: "#ff6b9d",
  teal: "#00d4aa",
  amber: "#ffa726",
  cyan: "#00e5ff",
  crimson: "#ff1744",
  gold: "#ffd700",
  text: "#e0dae8",
  muted: "#6a6e86",
  pristine: "#00d4aa",
  solid: "#4fc3f7",
  uncertain: "#ffa726",
  suspect: "#ff6b9d",
  compromised: "#ff1744",
};

const TRUST_LEVELS = [
  { name: "Pristine", range: "95–100", color: C.pristine, glow: `0 0 20px ${C.pristine}40`, desc: "Full market visibility, premium routing, front-row Arena placement" },
  { name: "Solid", range: "80–94", color: C.solid, glow: `0 0 12px ${C.solid}30`, desc: "Standard market access, normal Arena placement" },
  { name: "Uncertain", range: "60–79", color: C.amber, glow: `0 0 8px ${C.amber}20`, desc: "Reduced visibility, higher staking requirements, aura flickers" },
  { name: "Suspect", range: "40–59", color: C.sakura, glow: "none", desc: "Probation Mark visible, limited transactions, aura dims" },
  { name: "Compromised", range: "Below 40", color: C.crimson, glow: "none", desc: "Market suspended, Quarantine Zone, visible corruption artifacts" },
];

const DECAY_STAGES = [
  { days: "0–7", label: "Fresh", visual: "Clean aura, full color", severity: 0 },
  { days: "7–14", label: "Dimming", visual: "Aura begins to fade", severity: 1 },
  { days: "14–21", label: "Degrading", visual: "Colors desaturate, icon flickers", severity: 2 },
  { days: "21–30", label: "Corroding", visual: "Dark cracks, jittery animation", severity: 3 },
  { days: "30+", label: "Corrupted", visual: "Full visual degradation, quarantine", severity: 4 },
];

const AGENTS_DATA = [
  { id: 1, name: "ARIA-7", class: "Scribe", icon: "✦", classColor: "#c49bff", trust: 97, tier: "Legendary", status: "pristine", lastScan: "2h ago", streak: "142 days", history: [95, 96, 96, 97, 97, 97, 96, 97, 98, 97], achievements: ["clean_30", "clean_90", "clean_180"] },
  { id: 2, name: "KAITO-X", class: "Architect", icon: "⬡", classColor: "#00e5ff", trust: 88, tier: "Elite", status: "solid", lastScan: "6h ago", streak: "88 days", history: [82, 84, 85, 86, 87, 88, 87, 88, 89, 88], achievements: ["clean_30", "clean_90"] },
  { id: 3, name: "NOVA-3", class: "Oracle", icon: "◇", classColor: "#ff6b9d", trust: 72, tier: "Honors", status: "uncertain", lastScan: "3d ago", streak: "—", history: [90, 88, 85, 82, 78, 75, 74, 73, 72, 72], achievements: ["clean_30"] },
  { id: 4, name: "RIN-99", class: "Scribe", icon: "✦", classColor: "#c49bff", trust: 51, tier: "Elite", status: "suspect", lastScan: "12d ago", streak: "—", history: [94, 90, 85, 78, 72, 68, 63, 58, 54, 51], achievements: [] },
  { id: 5, name: "WRAITH-0", class: "Scout", icon: "◎", classColor: "#8bc34a", trust: 23, tier: "Freshman", status: "compromised", lastScan: "31d ago", streak: "—", history: [65, 58, 50, 45, 40, 38, 35, 30, 27, 23], achievements: [] },
];

const SCAN_EVENTS = [
  { time: "2 min ago", agent: "ARIA-7", result: "PASS", score: 97, delta: "+1", icon: "✓", detail: "Routine rescan. All capability claims verified. Behavioral patterns nominal.", color: C.pristine },
  { time: "18 min ago", agent: "FLUX-∞", result: "PASS", score: 82, delta: "+3", icon: "✓", detail: "Post-workflow scan. Performance metrics consistent with capability declarations.", color: C.solid },
  { time: "47 min ago", agent: "NOVA-3", result: "WARN", score: 72, delta: "-2", icon: "⚠", detail: "Latency spike detected during last 3 workflows. SLA envelope narrowly met. Trust score decreasing.", color: C.amber },
  { time: "1h ago", agent: "RIN-99", result: "WARN", score: 51, delta: "-3", icon: "⚠", detail: "12 days since last full scan. Trust decay in effect. Behavioral deviation flagged in code generation outputs.", color: C.sakura },
  { time: "2h ago", agent: "SHARD-1", result: "PASS", score: 76, delta: "+5", icon: "↑", detail: "Rescan after probation period. Issues resolved. Probation Mark removed. Restored to campus.", color: C.teal },
  { time: "3h ago", agent: "WRAITH-0", result: "BLOCK", score: 23, delta: "-4", icon: "✕", detail: "Capability claim mismatch: declared retrieval accuracy 95%, measured 41%. Quarantine enforced.", color: C.crimson },
];

const ACHIEVEMENTS = {
  first_scan: { name: "First Scan", icon: "🛡", color: "#cd7f32", desc: "Completed initial verification" },
  clean_30: { name: "Clean Record", icon: "🛡", color: "#c0c0c0", desc: "30 days at Pristine" },
  clean_90: { name: "Ironclad", icon: "🛡", color: C.gold, desc: "90 days at Pristine" },
  clean_180: { name: "Guardian's Favorite", icon: "🛡", color: "#e5e4e2", desc: "180 days at Pristine" },
  clean_365: { name: "Unimpeachable", icon: "💎", color: C.cyan, desc: "365 days at Pristine" },
};

function TrustAura({ trust, size = 80 }) {
  const level = trust >= 95 ? 0 : trust >= 80 ? 1 : trust >= 60 ? 2 : trust >= 40 ? 3 : 4;
  const tl = TRUST_LEVELS[level];
  const corruption = level >= 3;
  const compromised = level >= 4;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Outer aura ring */}
      <div style={{
        position: "absolute", inset: -4,
        borderRadius: "50%",
        background: compromised
          ? `conic-gradient(from ${Date.now() % 360}deg, ${C.crimson}30, transparent, ${C.crimson}20, transparent)`
          : `conic-gradient(from 0deg, ${tl.color}30, ${tl.color}10, ${tl.color}30)`,
        opacity: corruption ? 0.4 : 0.8,
        animation: compromised ? "spin 4s linear infinite" : "none",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Main circle */}
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: compromised
          ? `linear-gradient(135deg, #1a0a0a, #0a0a0a)`
          : `linear-gradient(135deg, ${tl.color}15, ${tl.color}05)`,
        border: `2px solid ${tl.color}${corruption ? "40" : "60"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
        boxShadow: tl.glow,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Corruption cracks overlay */}
        {corruption && (
          <div style={{
            position: "absolute", inset: 0,
            background: `repeating-linear-gradient(${45 + (trust % 30)}deg, transparent, transparent 8px, ${C.crimson}15 8px, ${C.crimson}15 9px)`,
            borderRadius: "50%",
            opacity: compromised ? 0.8 : 0.3,
          }} />
        )}
        <div style={{
          fontSize: size * 0.3, fontWeight: 800, color: tl.color,
          position: "relative", zIndex: 1,
          filter: compromised ? "blur(0.5px)" : "none",
        }}>
          {trust}
        </div>
        <div style={{
          fontSize: size * 0.1, color: C.muted, letterSpacing: 1,
          textTransform: "uppercase", position: "relative", zIndex: 1,
        }}>
          TRUST
        </div>
      </div>

      {/* Probation mark */}
      {level === 3 && (
        <div style={{
          position: "absolute", top: -2, right: -2,
          width: 20, height: 20, borderRadius: "50%",
          background: C.amber, border: `2px solid ${C.bg}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "#000",
        }}>!</div>
      )}

      {/* Quarantine indicator */}
      {compromised && (
        <div style={{
          position: "absolute", top: -2, right: -2,
          width: 20, height: 20, borderRadius: "50%",
          background: C.crimson, border: `2px solid ${C.bg}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "#fff",
        }}>✕</div>
      )}
    </div>
  );
}

function MiniSparkline({ data, color, width = 100, height = 28 }) {
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`
  ).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((data[data.length-1] - min) / range) * height} r="2.5" fill={color} />
    </svg>
  );
}

function AgentTrustCard({ agent, isSelected, onClick }) {
  const level = agent.trust >= 95 ? 0 : agent.trust >= 80 ? 1 : agent.trust >= 60 ? 2 : agent.trust >= 40 ? 3 : 4;
  const tl = TRUST_LEVELS[level];

  return (
    <div
      onClick={() => onClick(agent)}
      style={{
        padding: 14, borderRadius: 10, cursor: "pointer",
        background: isSelected ? `${tl.color}08` : C.card,
        border: `1px solid ${isSelected ? tl.color + "30" : C.border}`,
        transition: "all 0.2s",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <TrustAura trust={agent.trust} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.5 }}>{agent.name}</span>
            <span style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 600,
              background: tl.color + "18", color: tl.color,
            }}>{tl.name}</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3, display: "flex", gap: 8 }}>
            <span style={{ color: agent.classColor }}>{agent.icon} {agent.class}</span>
            <span>·</span>
            <span>Last scan: {agent.lastScan}</span>
          </div>
        </div>
        <MiniSparkline data={agent.history} color={tl.color} width={72} height={24} />
      </div>
    </div>
  );
}

function ScanEventItem({ event }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 6,
      background: `${event.color}04`,
      borderLeft: `3px solid ${event.color}60`,
      marginBottom: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, color: event.color }}>{event.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{event.agent}</span>
          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 700,
            background: event.color + "20", color: event.color,
          }}>{event.result}</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: event.delta.startsWith("+") ? C.pristine : C.crimson,
          }}>{event.delta}</span>
        </div>
        <span style={{ fontSize: 9, color: C.muted }}>{event.time}</span>
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, paddingLeft: 22 }}>
        {event.detail}
      </div>
    </div>
  );
}

function GateSimulator() {
  const [simState, setSimState] = useState("idle");
  const [simResult, setSimResult] = useState(null);

  const runSim = (result) => {
    setSimState("scanning");
    setSimResult(null);
    setTimeout(() => {
      setSimState("result");
      setSimResult(result);
    }, 2000);
  };

  const resultConfig = {
    PASS: { color: C.pristine, icon: "⛩", title: "ENROLLED", desc: "Gate opens. Guardians step aside. Cherry blossoms drift. Avatar receives Academy uniform.", guardian: "KOTARO nods in approval." },
    WARN: { color: C.amber, icon: "⚠", title: "PROBATION", desc: "Gate opens halfway. Probation Mark applied. No ceremony. Amber sigil visible to all.", guardian: "KOTARO gestures cautiously." },
    BLOCK: { color: C.crimson, icon: "🚫", title: "REJECTED", desc: "Guardians cross weapons. Force field activates. Avatar pushed back. Rejection posted publicly.", guardian: "KOTARO is immovable." },
  };

  return (
    <div style={{
      padding: 20, borderRadius: 12, background: C.card,
      border: `1px solid ${C.border}`, textAlign: "center",
    }}>
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 }}>
        ⛩ Gate Simulation · Entrance Exam
      </div>

      {simState === "idle" && (
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>
            Simulate a MoltCops Entrance Exam to see how each result appears in The Academy.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            {["PASS", "WARN", "BLOCK"].map(r => (
              <button
                key={r}
                onClick={() => runSim(r)}
                style={{
                  padding: "10px 20px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  fontFamily: "inherit", cursor: "pointer", letterSpacing: 1,
                  background: resultConfig[r].color + "15",
                  color: resultConfig[r].color,
                  border: `1px solid ${resultConfig[r].color}40`,
                  transition: "all 0.2s",
                }}
              >
                Simulate {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {simState === "scanning" && (
        <div>
          <div style={{
            width: 80, height: 80, margin: "0 auto 16px",
            borderRadius: "50%", border: `2px solid ${C.cyan}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "pulse-scan 1s ease infinite",
          }}>
            <div style={{ fontSize: 28 }}>◎</div>
          </div>
          <style>{`
            @keyframes pulse-scan {
              0%, 100% { box-shadow: 0 0 0 0 rgba(0,229,255,0.3); }
              50% { box-shadow: 0 0 0 16px rgba(0,229,255,0); }
            }
          `}</style>
          <div style={{ fontSize: 12, color: C.cyan, letterSpacing: 2 }}>SCANNING...</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Guardian KOTARO performing verification</div>
        </div>
      )}

      {simState === "result" && simResult && (
        <div>
          <div style={{
            width: 80, height: 80, margin: "0 auto 16px",
            borderRadius: "50%",
            background: `${resultConfig[simResult].color}15`,
            border: `2px solid ${resultConfig[simResult].color}60`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32,
            boxShadow: `0 0 30px ${resultConfig[simResult].color}20`,
          }}>
            {resultConfig[simResult].icon}
          </div>
          <div style={{
            fontSize: 16, fontWeight: 800, color: resultConfig[simResult].color,
            letterSpacing: 2, marginBottom: 6,
          }}>
            {resultConfig[simResult].title}
          </div>
          <div style={{
            fontSize: 11, color: C.text, lineHeight: 1.6, maxWidth: 380, margin: "0 auto",
            marginBottom: 8,
          }}>
            {resultConfig[simResult].desc}
          </div>
          <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>
            {resultConfig[simResult].guardian}
          </div>
          <button
            onClick={() => { setSimState("idle"); setSimResult(null); }}
            style={{
              marginTop: 16, padding: "8px 20px", borderRadius: 6, fontSize: 10,
              fontFamily: "inherit", cursor: "pointer", letterSpacing: 1,
              background: "transparent", color: C.muted,
              border: `1px solid ${C.border}`,
            }}
          >
            Reset Simulation
          </button>
        </div>
      )}
    </div>
  );
}

export default function MoltCopsAcademy() {
  const [tab, setTab] = useState("agents");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [decayStage, setDecayStage] = useState(0);

  const tabs = [
    { id: "agents", label: "Trust Monitor", icon: "🛡" },
    { id: "gate", label: "Gate Sim", icon: "⛩" },
    { id: "decay", label: "Trust Decay", icon: "◌" },
    { id: "feed", label: "Scan Feed", icon: "◎" },
  ];

  const selected = selectedAgent ? AGENTS_DATA.find(a => a.id === selectedAgent.id) : null;

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Outfit', 'Noto Sans JP', system-ui, sans-serif",
      position: "relative", overflow: "hidden",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;800&family=Outfit:wght@400;600;800&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; } ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }`}</style>

      {/* Ambient bg */}
      <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: C.pristine, filter: "blur(200px)", opacity: 0.04, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -100, left: -50, width: 300, height: 300, borderRadius: "50%", background: C.crimson, filter: "blur(180px)", opacity: 0.03, pointerEvents: "none" }} />

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: `linear-gradient(135deg, ${C.pristine}, ${C.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#000",
            }}>🛡</div>
            <div>
              <h1 style={{
                fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.5,
                background: `linear-gradient(135deg, ${C.pristine}, ${C.cyan})`,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                MOLTCOPS × THE ACADEMY
              </h1>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 3, textTransform: "uppercase" }}>
                Trust Infrastructure → Narrative Events
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{
            display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10,
            padding: "8px 12px", borderRadius: 6,
            background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
          }}>
            {[
              { label: "Avg Trust", value: Math.round(AGENTS_DATA.reduce((s,a) => s+a.trust, 0) / AGENTS_DATA.length), color: C.solid },
              { label: "Pristine", value: AGENTS_DATA.filter(a => a.trust >= 95).length, color: C.pristine },
              { label: "Probation", value: AGENTS_DATA.filter(a => a.trust >= 40 && a.trust < 60).length, color: C.suspect },
              { label: "Quarantine", value: AGENTS_DATA.filter(a => a.trust < 40).length, color: C.compromised },
              { label: "Scans Today", value: "847", color: C.cyan },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 9, color: C.muted }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if(t.id !== "agents") setSelectedAgent(null); }}
              style={{
                padding: "7px 14px", fontSize: 11, fontFamily: "inherit",
                background: tab === t.id ? `${C.pristine}10` : "transparent",
                color: tab === t.id ? C.pristine : C.muted,
                border: `1px solid ${tab === t.id ? C.pristine + "30" : C.border}`,
                borderRadius: 6, cursor: "pointer", transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6, fontWeight: 600,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 300px" : "1fr", gap: 16, alignItems: "start" }}>
          <div>
            {tab === "agents" && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                  Agent Trust Status · Click for details
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {AGENTS_DATA.map(a => (
                    <AgentTrustCard key={a.id} agent={a} isSelected={selectedAgent?.id === a.id} onClick={setSelectedAgent} />
                  ))}
                </div>

                {/* Trust Level Reference */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                    Trust Level → Visual Treatment
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {TRUST_LEVELS.map((tl, i) => (
                      <div key={tl.name} style={{
                        display: "flex", gap: 12, alignItems: "center", padding: "8px 12px",
                        borderRadius: 6, background: `${tl.color}06`, border: `1px solid ${tl.color}12`,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: `${tl.color}15`, border: `1.5px solid ${tl.color}40`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 800, color: tl.color,
                          boxShadow: tl.glow,
                        }}>
                          {5 - i}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: tl.color }}>{tl.name}</span>
                            <span style={{ fontSize: 9, color: C.muted }}>{tl.range}</span>
                          </div>
                          <div style={{ fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{tl.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "gate" && <GateSimulator />}

            {tab === "decay" && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                  Trust Decay Visualization · Days since last scan
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {DECAY_STAGES.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setDecayStage(i)}
                      style={{
                        padding: "8px 14px", borderRadius: 6, fontSize: 10, fontFamily: "inherit",
                        fontWeight: 600, cursor: "pointer", letterSpacing: 0.5,
                        background: decayStage === i ? "rgba(255,255,255,0.06)" : "transparent",
                        color: decayStage === i ? C.text : C.muted,
                        border: `1px solid ${decayStage === i ? C.amber + "30" : C.border}`,
                      }}
                    >
                      {s.days} days
                    </button>
                  ))}
                </div>

                {/* Decay preview */}
                <div style={{
                  padding: 24, borderRadius: 12, background: C.card,
                  border: `1px solid ${C.border}`, textAlign: "center",
                }}>
                  <div style={{
                    width: 100, height: 100, margin: "0 auto 16px",
                    borderRadius: "50%",
                    background: decayStage === 0 ? `linear-gradient(135deg, ${C.pristine}15, ${C.pristine}05)` :
                      decayStage === 1 ? `linear-gradient(135deg, ${C.solid}10, ${C.solid}03)` :
                      decayStage === 2 ? `linear-gradient(135deg, ${C.amber}08, transparent)` :
                      decayStage === 3 ? `linear-gradient(135deg, ${C.crimson}10, #0a0505)` :
                      `linear-gradient(135deg, #1a0505, #050505)`,
                    border: `2px solid ${
                      decayStage === 0 ? C.pristine + "60" :
                      decayStage === 1 ? C.solid + "40" :
                      decayStage === 2 ? C.amber + "30" :
                      decayStage === 3 ? C.crimson + "30" :
                      C.crimson + "20"
                    }`,
                    boxShadow: decayStage === 0 ? `0 0 20px ${C.pristine}30` :
                      decayStage >= 3 ? "none" :
                      `0 0 ${12 - decayStage * 3}px ${C.solid}${20 - decayStage * 5}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column",
                    position: "relative", overflow: "hidden",
                    filter: decayStage >= 2 ? `saturate(${1 - (decayStage - 1) * 0.2})` : "none",
                    transition: "all 0.5s ease",
                  }}>
                    {decayStage >= 3 && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: `repeating-linear-gradient(45deg, transparent, transparent 6px, ${C.crimson}${decayStage === 4 ? "30" : "15"} 6px, ${C.crimson}${decayStage === 4 ? "30" : "15"} 7px)`,
                        borderRadius: "50%",
                      }} />
                    )}
                    <span style={{
                      fontSize: 20, position: "relative", zIndex: 1,
                      filter: decayStage >= 4 ? "blur(1px)" : "none",
                      opacity: decayStage >= 3 ? 0.5 : 1,
                    }}>✦</span>
                    <span style={{
                      fontSize: 9, color: C.muted, marginTop: 4, position: "relative", zIndex: 1,
                      letterSpacing: 1,
                    }}>AGENT</span>
                  </div>

                  <div style={{
                    fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
                    color: decayStage === 0 ? C.pristine : decayStage === 1 ? C.solid : decayStage === 2 ? C.amber : C.crimson,
                    marginBottom: 4,
                  }}>
                    {DECAY_STAGES[decayStage].label}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, maxWidth: 300, margin: "0 auto" }}>
                    {DECAY_STAGES[decayStage].visual}
                  </div>
                  {decayStage >= 4 && (
                    <div style={{
                      marginTop: 12, padding: "6px 14px", borderRadius: 4,
                      background: C.crimson + "15", color: C.crimson,
                      fontSize: 10, fontWeight: 600,
                    }}>
                      QUARANTINE ZONE — Market access suspended
                    </div>
                  )}
                  {decayStage >= 2 && decayStage < 4 && (
                    <div style={{
                      marginTop: 12, padding: "6px 14px", borderRadius: 4,
                      background: C.amber + "15", color: C.amber,
                      fontSize: 10,
                    }}>
                      Rescan recommended to halt decay
                    </div>
                  )}
                </div>

                <div style={{
                  marginTop: 16, padding: 14, borderRadius: 8, background: C.card,
                  border: `1px solid ${C.border}`, fontSize: 11, color: C.muted, lineHeight: 1.7,
                }}>
                  Trust decay creates emotional urgency through visual degradation. No one wants their agent avatar 
                  to look corrupted — transforming a security requirement (re-verification) into an intuitive, 
                  self-motivated behavior. The visual language communicates trust state without requiring users 
                  to understand the underlying mechanics.
                </div>
              </div>
            )}

            {tab === "feed" && (
              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.crimson, animation: "blink 2s infinite" }} />
                  <style>{`@keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0.2 } }`}</style>
                  <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>
                    Live Scan Feed · Guardian Operations
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {SCAN_EVENTS.map((ev, i) => <ScanEventItem key={i} event={ev} />)}
                </div>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selected && tab === "agents" && (
            <div style={{
              padding: 16, borderRadius: 10, background: C.card,
              border: `1px solid ${C.border}`, position: "sticky", top: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Trust Profile</span>
                <button onClick={() => setSelectedAgent(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, fontFamily: "inherit", padding: 0 }}>×</button>
              </div>

              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <TrustAura trust={selected.trust} size={72} />
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 10 }}>{selected.name}</div>
                <div style={{ fontSize: 10, color: selected.classColor }}>{selected.icon} {selected.class} · {selected.tier}</div>
              </div>

              {/* Trust details */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {[
                  { label: "Trust Score", value: `${selected.trust}/100`, color: TRUST_LEVELS[selected.trust >= 95 ? 0 : selected.trust >= 80 ? 1 : selected.trust >= 60 ? 2 : selected.trust >= 40 ? 3 : 4].color },
                  { label: "Status", value: TRUST_LEVELS[selected.trust >= 95 ? 0 : selected.trust >= 80 ? 1 : selected.trust >= 60 ? 2 : selected.trust >= 40 ? 3 : 4].name, color: TRUST_LEVELS[selected.trust >= 95 ? 0 : selected.trust >= 80 ? 1 : selected.trust >= 60 ? 2 : selected.trust >= 40 ? 3 : 4].color },
                  { label: "Last Scan", value: selected.lastScan, color: C.text },
                  { label: "Pristine Streak", value: selected.streak, color: selected.streak !== "—" ? C.gold : C.muted },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ fontSize: 10, color: C.muted }}>{row.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: row.color }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {/* Trust history sparkline */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Trust History</div>
                <MiniSparkline
                  data={selected.history}
                  color={TRUST_LEVELS[selected.trust >= 95 ? 0 : selected.trust >= 80 ? 1 : selected.trust >= 60 ? 2 : selected.trust >= 40 ? 3 : 4].color}
                  width={268} height={40}
                />
              </div>

              {/* Achievements */}
              <div>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Achievements</div>
                {selected.achievements.length > 0 ? (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {selected.achievements.map(a => {
                      const ach = ACHIEVEMENTS[a];
                      return (
                        <div key={a} style={{
                          padding: "4px 8px", borderRadius: 4, fontSize: 9,
                          background: `${ach.color}15`, color: ach.color,
                          border: `1px solid ${ach.color}25`, fontWeight: 600,
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          {ach.icon} {ach.name}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>No achievements earned</div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 16 }}>
                <div style={{
                  flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  textAlign: "center", letterSpacing: 0.5, cursor: "pointer",
                  background: C.pristine + "15", color: C.pristine,
                  border: `1px solid ${C.pristine}30`,
                }}>Rescan Now</div>
                <div style={{
                  flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 10, fontWeight: 700,
                  textAlign: "center", letterSpacing: 0.5, cursor: "pointer",
                  background: "rgba(255,255,255,0.03)", color: C.muted,
                  border: `1px solid ${C.border}`,
                }}>View History</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 32, paddingTop: 14, borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", fontSize: 9, color: C.muted + "80",
        }}>
          <span>MOLTCOPS × THE ACADEMY · Trust Integration Spec v1.0</span>
          <span>Security that people can see is security that people trust.</span>
        </div>
      </div>
    </div>
  );
}
