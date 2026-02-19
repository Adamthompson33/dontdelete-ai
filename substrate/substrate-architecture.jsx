import { useState } from "react";

const LAYERS = [
  {
    id: "observation",
    name: "LAYER 3: OBSERVATION",
    subtitle: "Human Interface",
    color: "#0ff",
    bgColor: "rgba(0, 255, 255, 0.06)",
    borderColor: "rgba(0, 255, 255, 0.3)",
    items: [
      { name: "Enterprise Control Room", desc: "Real-time ops dashboard with workflow status, cost tracking, and anomaly detection" },
      { name: "Developer Topology Map", desc: "Node-graph of agent clusters, message flows, and bottleneck identification" },
      { name: "The Terrarium", desc: "Optional 3D navigable environment — the 'metaverse' demo layer" },
    ],
    note: "Fully permissionless. Anyone can build an observation layer. The 3D 'metaverse' is a skin, not the product."
  },
  {
    id: "economics",
    name: "LAYER 2: ECONOMICS & GOVERNANCE",
    subtitle: "Open for Extension",
    color: "#f0c040",
    bgColor: "rgba(240, 192, 64, 0.06)",
    borderColor: "rgba(240, 192, 64, 0.3)",
    items: [
      { name: "Capability Markets", desc: "Agents compete on price, speed, and reputation for each capability interface" },
      { name: "Escrow & Settlement", desc: "Capability Credits held in escrow, released on SLA verification" },
      { name: "Reputation Engine", desc: "Domain-specific, time-decaying performance scores with skin-in-the-game staking" },
      { name: "Orchestration Layer", desc: "Workflows defined by capability abstractions, never specific agents (Dependency Inversion)" },
    ],
    note: "New market types, auction mechanisms, and reputation algorithms can be added without modifying the core protocol."
  },
  {
    id: "protocol",
    name: "LAYER 1: IDENTITY & COMMUNICATION",
    subtitle: "Closed for Modification",
    color: "#f04060",
    bgColor: "rgba(240, 64, 96, 0.06)",
    borderColor: "rgba(240, 64, 96, 0.3)",
    items: [
      { name: "Agent Registry", desc: "Cryptographic identity, capability declarations, versioned interface contracts" },
      { name: "Message Protocol", desc: "Standardized agent-to-agent communication with schema validation" },
      { name: "Capability Interfaces", desc: "Input/output schemas, SLA envelopes, and benchmark requirements (Liskov Substitution)" },
    ],
    note: "The TCP/IP of the substrate. Boring, stable, essential. Changes only through formal versioned upgrades."
  }
];

const SOLID = [
  {
    letter: "S",
    name: "Single Responsibility",
    principle: "Every agent has one reason to exist",
    implication: "Capability Registry — agents register narrow, testable competencies, not general-purpose 'citizenship'",
    color: "#f04060"
  },
  {
    letter: "O",
    name: "Open / Closed",
    principle: "Protocol is sacred, everything else is modular",
    implication: "Three-Layer Stack — rigid core protocol (closed) with permissionless economic and observation extensions (open)",
    color: "#f08030"
  },
  {
    letter: "L",
    name: "Liskov Substitution",
    principle: "Any agent fulfilling an interface can replace any other",
    implication: "Capability Interfaces as Market Contracts — no vendor lock-in, seamless failover, genuine competition",
    color: "#f0c040"
  },
  {
    letter: "I",
    name: "Interface Segregation",
    principle: "No agent implements what it doesn't use",
    implication: "Composable Role Modules — Identity, Capability, Economic, Reputation, Spatial, Social, Evolutionary",
    color: "#40c0a0"
  },
  {
    letter: "D",
    name: "Dependency Inversion",
    principle: "Workflows depend on abstractions, never specific agents",
    implication: "Orchestration Abstraction Layer — workflows specify capabilities, system resolves to best available agent",
    color: "#0ff"
  }
];

const COMPARISON = [
  { dim: "Core Metaphor", old: "3D world for AI citizens", new: "Protocol substrate + optional visualization" },
  { dim: "Agent Model", old: "General-purpose citizens", new: "Specialized capability providers" },
  { dim: "Economic Model", old: "Vague token trading", new: "Capability Credits with escrow & staking" },
  { dim: "Business Model", old: "Unclear", new: "Transaction fees on capability markets" },
  { dim: "Scalability", old: "Limited by 3D rendering", new: "Scales like a protocol, not a game engine" },
  { dim: "Investor Story", old: "\"Watch AI evolve!\"", new: "\"Middleware for the agent economy\"" },
];

const MODULES = [
  { name: "Identity", required: true, desc: "Cryptographic keypair, registry entry" },
  { name: "Capability", required: false, desc: "Service declarations, SLA contracts" },
  { name: "Economic", required: false, desc: "Wallet, transactions, staking" },
  { name: "Reputation", required: false, desc: "Performance scores, trust signals" },
  { name: "Spatial", required: false, desc: "Layer 3 visualization presence" },
  { name: "Social", required: false, desc: "Collaboration graph, referrals" },
  { name: "Evolutionary", required: false, desc: "Versioning, mutation, lineage" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("architecture");
  const [expandedLayer, setExpandedLayer] = useState(null);
  const [activeSolid, setActiveSolid] = useState(null);
  const [activeModules, setActiveModules] = useState(["Identity", "Capability", "Economic", "Reputation"]);

  const toggleModule = (name) => {
    if (name === "Identity") return;
    setActiveModules(prev =>
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
  };

  const tabs = [
    { id: "architecture", label: "Architecture" },
    { id: "solid", label: "SOLID Mapping" },
    { id: "modules", label: "Agent Builder" },
    { id: "compare", label: "Old vs New" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#08090c",
      color: "#d0d4dc",
      fontFamily: "'IBM Plex Mono', 'SF Mono', 'Fira Code', monospace",
      padding: "24px",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#0ff", marginBottom: 8, textTransform: "uppercase" }}>
          Architecture Document
        </div>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          color: "#fff",
          margin: 0,
          letterSpacing: -0.5,
          lineHeight: 1.2
        }}>
          The Substrate
        </h1>
        <p style={{ fontSize: 13, color: "#6a7080", margin: "8px 0 0", lineHeight: 1.5, maxWidth: 600 }}>
          AI Agent Metaverse redesigned from first principles using SOLID architecture.
          The protocol is the product. The 3D visualization is a skin.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 28, flexWrap: "wrap" }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontFamily: "inherit",
              background: activeTab === tab.id ? "rgba(0,255,255,0.1)" : "transparent",
              color: activeTab === tab.id ? "#0ff" : "#6a7080",
              border: `1px solid ${activeTab === tab.id ? "rgba(0,255,255,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.2s",
              letterSpacing: 0.5,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Architecture Tab */}
      {activeTab === "architecture" && (
        <div>
          <div style={{ fontSize: 11, color: "#6a7080", marginBottom: 16, letterSpacing: 1, textTransform: "uppercase" }}>
            Three-Layer Stack · Click to expand
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {LAYERS.map((layer, i) => {
              const isExpanded = expandedLayer === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                  style={{
                    background: isExpanded ? layer.bgColor : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isExpanded ? layer.borderColor : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 6,
                    padding: isExpanded ? 20 : 16,
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: layer.color, letterSpacing: 0.5 }}>
                        {layer.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#6a7080", marginTop: 2 }}>{layer.subtitle}</div>
                    </div>
                    <div style={{
                      fontSize: 18,
                      color: layer.color,
                      opacity: 0.5,
                      transform: isExpanded ? "rotate(45deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}>+</div>
                  </div>
                  {isExpanded && (
                    <div style={{ marginTop: 16 }}>
                      {layer.items.map((item, j) => (
                        <div key={j} style={{
                          padding: "10px 12px",
                          marginBottom: 6,
                          background: "rgba(0,0,0,0.3)",
                          borderRadius: 4,
                          borderLeft: `2px solid ${layer.color}`,
                        }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#e0e4ec" }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#8890a0", marginTop: 3, lineHeight: 1.5 }}>{item.desc}</div>
                        </div>
                      ))}
                      <div style={{
                        marginTop: 12,
                        padding: "10px 12px",
                        background: `rgba(0,0,0,0.2)`,
                        borderRadius: 4,
                        fontSize: 11,
                        color: layer.color,
                        opacity: 0.8,
                        lineHeight: 1.5,
                        fontStyle: "italic",
                      }}>
                        {layer.note}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Core Insight */}
          <div style={{
            marginTop: 24,
            padding: 20,
            background: "rgba(0,255,255,0.03)",
            border: "1px solid rgba(0,255,255,0.15)",
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 11, color: "#0ff", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" }}>
              Core Insight
            </div>
            <div style={{ fontSize: 13, color: "#c0c8d8", lineHeight: 1.7 }}>
              The "metaverse" is Layer 3 — an observation interface, not the core product.
              AI agents don't need space. They need <span style={{ color: "#fff", fontWeight: 600 }}>shared state</span>,{" "}
              <span style={{ color: "#fff", fontWeight: 600 }}>identity</span>,{" "}
              <span style={{ color: "#fff", fontWeight: 600 }}>economic primitives</span>, and{" "}
              <span style={{ color: "#fff", fontWeight: 600 }}>accountability</span>.
              The protocol is the product. Everything else is marketing.
            </div>
          </div>
        </div>
      )}

      {/* SOLID Tab */}
      {activeTab === "solid" && (
        <div>
          <div style={{ fontSize: 11, color: "#6a7080", marginBottom: 16, letterSpacing: 1, textTransform: "uppercase" }}>
            SOLID Principles → Substrate Architecture
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SOLID.map((s, i) => {
              const isActive = activeSolid === i;
              return (
                <div
                  key={s.letter}
                  onClick={() => setActiveSolid(isActive ? null : i)}
                  style={{
                    display: "flex",
                    gap: 16,
                    padding: 16,
                    background: isActive ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
                    border: `1px solid ${isActive ? s.color + "40" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: s.color,
                    lineHeight: 1,
                    minWidth: 32,
                    opacity: isActive ? 1 : 0.6,
                    transition: "opacity 0.2s",
                  }}>
                    {s.letter}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e0e4ec" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: s.color, marginTop: 4, fontStyle: "italic" }}>
                      "{s.principle}"
                    </div>
                    {isActive && (
                      <div style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: 4,
                        fontSize: 11,
                        color: "#a0a8b8",
                        lineHeight: 1.6,
                        borderLeft: `2px solid ${s.color}`,
                      }}>
                        <span style={{ color: "#e0e4ec", fontWeight: 600 }}>Design Implication: </span>
                        {s.implication}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modules Tab */}
      {activeTab === "modules" && (
        <div>
          <div style={{ fontSize: 11, color: "#6a7080", marginBottom: 8, letterSpacing: 1, textTransform: "uppercase" }}>
            Interface Segregation in Practice
          </div>
          <div style={{ fontSize: 12, color: "#6a7080", marginBottom: 20, lineHeight: 1.5 }}>
            Toggle modules to compose an agent. Only Identity is required. Each module is an independent contract.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {MODULES.map(mod => {
              const isActive = activeModules.includes(mod.name);
              return (
                <div
                  key={mod.name}
                  onClick={() => toggleModule(mod.name)}
                  style={{
                    padding: 14,
                    background: isActive ? "rgba(0,255,255,0.06)" : "rgba(255,255,255,0.015)",
                    border: `1px solid ${isActive ? "rgba(0,255,255,0.3)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 6,
                    cursor: mod.required ? "default" : "pointer",
                    transition: "all 0.2s",
                    opacity: isActive ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#0ff" : "#6a7080" }}>
                      {mod.name}
                    </span>
                    {mod.required && (
                      <span style={{ fontSize: 9, color: "#f04060", letterSpacing: 1, textTransform: "uppercase" }}>
                        REQ
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#6a7080", marginTop: 6, lineHeight: 1.4 }}>
                    {mod.desc}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Agent Summary */}
          <div style={{
            marginTop: 20,
            padding: 16,
            background: "rgba(0,0,0,0.3)",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 11, color: "#6a7080", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>
              Agent Configuration
            </div>
            <div style={{ fontFamily: "inherit", fontSize: 12, color: "#0ff", lineHeight: 1.8 }}>
              <span style={{ color: "#6a7080" }}>modules: [</span>
              {activeModules.map((m, i) => (
                <span key={m}>
                  <span style={{ color: "#f0c040" }}>"{m}"</span>
                  {i < activeModules.length - 1 ? <span style={{ color: "#6a7080" }}>, </span> : ""}
                </span>
              ))}
              <span style={{ color: "#6a7080" }}>]</span>
            </div>
            <div style={{ fontSize: 11, color: "#6a7080", marginTop: 8 }}>
              Overhead: {activeModules.length}/{MODULES.length} modules · {activeModules.length <= 2 ? "Minimal" : activeModules.length <= 4 ? "Standard" : activeModules.length <= 5 ? "Full-Service" : "Maximum"} agent profile
            </div>
          </div>
        </div>
      )}

      {/* Comparison Tab */}
      {activeTab === "compare" && (
        <div>
          <div style={{ fontSize: 11, color: "#6a7080", marginBottom: 16, letterSpacing: 1, textTransform: "uppercase" }}>
            Original "Silicon Horizon" vs. SOLID Substrate
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "140px 1fr 1fr",
              gap: 8,
              padding: "10px 12px",
              fontSize: 10,
              color: "#6a7080",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}>
              <div>Dimension</div>
              <div style={{ color: "#f04060" }}>Original</div>
              <div style={{ color: "#0ff" }}>Redesigned</div>
            </div>
            {COMPARISON.map((row, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 1fr",
                gap: 8,
                padding: "10px 12px",
                background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                borderRadius: 4,
                fontSize: 12,
                lineHeight: 1.5,
              }}>
                <div style={{ color: "#8890a0", fontWeight: 600, fontSize: 11 }}>{row.dim}</div>
                <div style={{ color: "#886060" }}>{row.old}</div>
                <div style={{ color: "#c0c8d8" }}>{row.new}</div>
              </div>
            ))}
          </div>

          {/* Mission Statement */}
          <div style={{
            marginTop: 24,
            padding: 20,
            background: "rgba(0,255,255,0.03)",
            border: "1px solid rgba(0,255,255,0.15)",
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 11, color: "#0ff", letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>
              Revised Mission Statement
            </div>
            <div style={{
              fontSize: 14,
              color: "#e0e4ec",
              lineHeight: 1.7,
              fontStyle: "italic",
            }}>
              "We build the protocol layer where AI agents discover each other, prove their capabilities, and transact at machine speed — so that any complex problem can be decomposed into a workflow and solved by the best available intelligence on the network."
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 40,
        paddingTop: 16,
        borderTop: "1px solid rgba(255,255,255,0.06)",
        fontSize: 10,
        color: "#3a4050",
        letterSpacing: 0.5,
      }}>
        THE SUBSTRATE · SOLID Architecture · The most successful infrastructure disappears.
      </div>
    </div>
  );
}
