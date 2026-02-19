import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// MOLT COPS — FOUNDING OPERATIVE BADGE MINT
// "100 badges. Earned, not bought."
// ═══════════════════════════════════════════════════════════════

// In production, these come from wagmi hooks:
// import { useAccount, useConnect, useWriteContract, useReadContract } from 'wagmi'
// import { ConnectButton } from '@rainbow-me/rainbowkit'

// ── Contract Config (update after deployment) ──
const CONTRACT = {
  address: "0x0000000000000000000000000000000000000000",
  chainId: 8453, // Base
  chainName: "Base",
  blockExplorer: "https://basescan.org",
};

// ── Simulated state for the preview ──
// Replace with actual wagmi hooks in production

function useMockWallet() {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  return {
    connected,
    address,
    connect: () => {
      setConnected(true);
      setAddress("0x7a3" + "x".repeat(34) + "f91");
    },
    disconnect: () => { setConnected(false); setAddress(""); },
  };
}

// ── Badge SVG Component ──
function BadgeArt({ number = "???", role = "Operative", spinning = false, minted = false }) {
  return (
    <div style={{
      width: 280, height: 350,
      position: "relative",
      animation: spinning ? "float 4s ease-in-out infinite" : "none",
    }}>
      <svg viewBox="0 0 400 500" style={{
        width: "100%", height: "100%",
        filter: minted
          ? "drop-shadow(0 0 30px rgba(255,59,92,0.3)) drop-shadow(0 0 60px rgba(74,158,255,0.15))"
          : "drop-shadow(0 0 20px rgba(255,255,255,0.05))",
        transition: "filter 1s ease",
      }}>
        <defs>
          <linearGradient id="siren" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "#ff3b5c" }} />
            <stop offset="100%" style={{ stopColor: "#4a9eff" }} />
          </linearGradient>
          <linearGradient id="sirenAnim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "#ff3b5c" }}>
              <animate attributeName="stop-color" values="#ff3b5c;#4a9eff;#ff3b5c" dur="4s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" style={{ stopColor: "#4a9eff" }}>
              <animate attributeName="stop-color" values="#4a9eff;#ff3b5c;#4a9eff" dur="4s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="g" />
            <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(74,158,255,0.06)" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Background */}
        <rect width="400" height="500" fill="#06080d" rx="20" />
        <rect width="400" height="500" fill="url(#grid)" rx="20" />

        {/* Shield outline */}
        <path
          d="M200 60 L320 120 L320 280 Q320 380 200 440 Q80 380 80 280 L80 120 Z"
          fill="none" stroke="url(#sirenAnim)" strokeWidth="2"
          opacity={minted ? "0.6" : "0.15"}
          style={{ transition: "opacity 1s ease" }}
        />
        <path
          d="M200 80 L300 130 L300 270 Q300 360 200 420 Q100 360 100 270 L100 130 Z"
          fill={minted ? "rgba(255,59,92,0.04)" : "rgba(255,255,255,0.01)"}
          stroke="url(#siren)" strokeWidth="1"
          opacity={minted ? "0.4" : "0.1"}
          style={{ transition: "all 1s ease" }}
        />

        {/* Pulse rings (when minted) */}
        {minted && (
          <>
            <circle cx="200" cy="200" r="60" fill="none" stroke="rgba(255,59,92,0.15)" strokeWidth="0.5">
              <animate attributeName="r" from="60" to="150" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.3" to="0" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="200" cy="200" r="60" fill="none" stroke="rgba(74,158,255,0.15)" strokeWidth="0.5">
              <animate attributeName="r" from="60" to="150" dur="3s" begin="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.3" to="0" dur="3s" begin="1.5s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        {/* Center emblem */}
        <text x="200" y="200" textAnchor="middle" fontSize="52"
          filter={minted ? "url(#glow)" : "none"}>🛡️</text>

        {/* MOLT COPS */}
        <text x="200" y="260" textAnchor="middle" fontFamily="monospace"
          fontSize="22" fontWeight="bold" fill="url(#sirenAnim)" letterSpacing="4">
          MOLT COPS
        </text>

        {/* Role */}
        <text x="200" y="288" textAnchor="middle" fontFamily="monospace"
          fontSize="10" fill="rgba(255,255,255,0.35)" letterSpacing="3">
          {role.toUpperCase()}
        </text>

        {/* Badge number */}
        <text x="200" y="340" textAnchor="middle" fontFamily="monospace"
          fontSize="38" fontWeight="bold" fill={minted ? "url(#sirenAnim)" : "rgba(255,255,255,0.15)"}
          letterSpacing="3"
          style={{ transition: "fill 1s ease" }}>
          #{number}
        </text>

        {/* Founding text */}
        <text x="200" y="370" textAnchor="middle" fontFamily="monospace"
          fontSize="9" fill="rgba(255,255,255,0.2)" letterSpacing="4">
          FOUNDING OPERATIVE
        </text>

        {/* Divider */}
        <line x1="140" y1="390" x2="260" y2="390" stroke="url(#siren)" strokeWidth="0.5" opacity="0.25" />

        {/* Tagline */}
        <text x="200" y="412" textAnchor="middle" fontFamily="monospace"
          fontSize="7.5" fill="rgba(255,255,255,0.15)" letterSpacing="2.5">
          TO PROTECT AND SERVE (HUMANITY)
        </text>

        {/* Edition */}
        <text x="200" y="470" textAnchor="middle" fontFamily="monospace"
          fontSize="8" fill="rgba(255,255,255,0.1)">
          {number} / 100
        </text>
      </svg>
    </div>
  );
}

// ── Supply Bar ──
function SupplyBar({ minted, max }) {
  const pct = (minted / max) * 100;
  return (
    <div style={{ width: "100%" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", marginBottom: 8,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
      }}>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>
          <span style={{ color: "#ff3b5c", fontWeight: 700 }}>{minted}</span> / {max} claimed
        </span>
        <span style={{ color: "rgba(255,255,255,0.25)" }}>{max - minted} remaining</span>
      </div>
      <div style={{
        width: "100%", height: 6, borderRadius: 3,
        background: "rgba(255,255,255,0.05)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 3,
          background: "linear-gradient(90deg, #ff3b5c, #4a9eff)",
          transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 0 12px rgba(255,59,92,0.3)",
        }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN MINT PAGE
// ═══════════════════════════════════════════════════════════════

export default function BadgeMintPage() {
  const wallet = useMockWallet();
  const [mintState, setMintState] = useState("idle"); // idle | checking | eligible | ineligible | minting | success | error
  const [totalMinted, setTotalMinted] = useState(23);
  const [myBadge, setMyBadge] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Simulate supply ticking up
  useEffect(() => {
    const t = setInterval(() => {
      setTotalMinted(prev => Math.min(100, prev + (Math.random() > 0.92 ? 1 : 0)));
    }, 8000);
    return () => clearInterval(t);
  }, []);

  // Check eligibility when wallet connects
  useEffect(() => {
    if (wallet.connected && mintState === "idle") {
      setMintState("checking");
      // Simulate allowlist check (in production: verify Merkle proof)
      setTimeout(() => {
        setMintState("eligible"); // or "ineligible"
      }, 1500);
    }
    if (!wallet.connected) {
      setMintState("idle");
      setMyBadge(null);
    }
  }, [wallet.connected]);

  const handleMint = () => {
    setMintState("minting");
    // In production:
    // writeContract({
    //   address: CONTRACT.address,
    //   abi: BADGE_ABI,
    //   functionName: 'mint',
    //   args: [merkleProof],
    // })
    setTimeout(() => {
      const badge = totalMinted + 1;
      setTotalMinted(badge);
      setMyBadge(badge);
      setMintState("success");
    }, 3000);
  };

  const padNum = (n) => String(n).padStart(3, "0");

  return (
    <div style={{
      minHeight: "100vh", background: "#06080d", color: "#fff",
      fontFamily: "'DM Sans', sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #06080d; }
        ::selection { background: rgba(255,59,92,0.25); }
        @keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-10px); }}
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); }}
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; }}
        @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); }}
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(60px) rotate(720deg); opacity: 0; }
        }
      `}</style>

      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse 60% 40% at 30% 0%, rgba(255,59,92,0.03) 0%, transparent 60%),
          radial-gradient(ellipse 60% 40% at 70% 0%, rgba(74,158,255,0.03) 0%, transparent 60%),
          #06080d
        `,
      }}>
        <div style={{
          position: "absolute", inset: 0, opacity: 0.02,
          backgroundImage: `
            linear-gradient(rgba(74,158,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(74,158,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }} />
      </div>

      {/* Nav */}
      <nav style={{
        position: "relative", zIndex: 10, padding: "0 24px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto", display: "flex",
          alignItems: "center", justifyContent: "space-between", height: 64,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <span style={{
              fontSize: 16, fontWeight: 800, letterSpacing: "0.06em",
              fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>MOLT COPS</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{
              fontSize: 11, color: "rgba(255,255,255,0.25)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {CONTRACT.chainName} Network
            </span>
            {wallet.connected ? (
              <button onClick={wallet.disconnect} style={{
                padding: "7px 14px", borderRadius: 8,
                background: "rgba(74,158,255,0.1)",
                border: "1px solid rgba(74,158,255,0.2)",
                color: "#4a9eff", fontSize: 12, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              }}>
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-3)}
              </button>
            ) : (
              <button onClick={wallet.connect} style={{
                padding: "7px 14px", borderRadius: 8,
                background: "rgba(255,59,92,0.1)",
                border: "1px solid rgba(255,59,92,0.2)",
                color: "#ff3b5c", fontSize: 12, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
              }}>Connect Wallet</button>
            )}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", zIndex: 2, padding: "40px 24px",
      }}>
        <div style={{
          maxWidth: 900, width: "100%",
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 56, alignItems: "center",
        }}>
          {/* Left: Badge Preview */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
            animation: "fadeUp 0.6s ease-out",
          }}>
            <BadgeArt
              number={myBadge ? padNum(myBadge) : padNum(totalMinted + 1)}
              spinning={!myBadge}
              minted={!!myBadge}
            />

            {/* Supply */}
            <div style={{ width: 280 }}>
              <SupplyBar minted={totalMinted} max={100} />
            </div>
          </div>

          {/* Right: Mint Interface */}
          <div style={{ animation: "fadeUp 0.6s ease-out 0.1s both" }}>
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#ff3b5c", letterSpacing: "0.12em", fontWeight: 700,
            }}>FOUNDING OPERATIVE</span>

            <h1 style={{
              fontSize: 36, fontWeight: 800, marginTop: 10, marginBottom: 14,
              fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em", lineHeight: 1.15,
            }}>
              Claim Your Badge
            </h1>

            <p style={{
              fontSize: 15, lineHeight: 1.65, color: "rgba(255,255,255,0.45)",
              fontFamily: "'DM Sans', sans-serif", marginBottom: 28,
            }}>
              100 badges for the first operatives who believe early. 
              Free to mint. On-chain forever. Your badge number becomes your 
              rank in the Molt Cops trusted reviewer network — the Sybil-resistant 
              backbone of ERC-8004 reputation filtering.
            </p>

            {/* Status / Action Area */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: "24px",
              marginBottom: 24,
            }}>
              {/* Not connected */}
              {!wallet.connected && (
                <div style={{ textAlign: "center" }}>
                  <p style={{
                    fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>Connect your wallet to check eligibility</p>
                  <button onClick={wallet.connect} style={{
                    padding: "14px 32px", borderRadius: 12,
                    background: "linear-gradient(135deg, #ff3b5c, #e02050)",
                    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                    boxShadow: "0 0 30px rgba(255,59,92,0.2)",
                    width: "100%",
                  }}>Connect Wallet</button>
                </div>
              )}

              {/* Checking */}
              {mintState === "checking" && (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{
                    width: 24, height: 24, border: "2px solid rgba(255,59,92,0.3)",
                    borderTopColor: "#ff3b5c", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 12px",
                  }} />
                  <p style={{
                    fontSize: 13, color: "rgba(255,255,255,0.5)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>Verifying allowlist...</p>
                </div>
              )}

              {/* Eligible */}
              {mintState === "eligible" && (
                <div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: "#34d399",
                      boxShadow: "0 0 8px rgba(52,211,153,0.5)",
                    }} />
                    <span style={{
                      fontSize: 12, color: "#34d399", fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>ELIGIBLE — You're on the list</span>
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "12px 16px", marginBottom: 16,
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 10, fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Price</span>
                    <span style={{ color: "#34d399", fontWeight: 700 }}>FREE</span>
                  </div>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "12px 16px", marginBottom: 20,
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 10, fontSize: 13,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Your badge will be</span>
                    <span style={{ color: "#fff", fontWeight: 700 }}>#{padNum(totalMinted + 1)}</span>
                  </div>
                  <button onClick={handleMint} style={{
                    padding: "14px 32px", borderRadius: 12,
                    background: "linear-gradient(135deg, #ff3b5c, #e02050)",
                    border: "none", color: "#fff", fontSize: 15, fontWeight: 700,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                    boxShadow: "0 0 30px rgba(255,59,92,0.2)",
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 8,
                  }}>
                    <span>Mint Badge</span>
                    <span>🛡️</span>
                  </button>
                </div>
              )}

              {/* Minting */}
              {mintState === "minting" && (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{
                    width: 32, height: 32, border: "2px solid rgba(255,59,92,0.2)",
                    borderTopColor: "#ff3b5c", borderRightColor: "#4a9eff",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    margin: "0 auto 14px",
                  }} />
                  <p style={{
                    fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: 500,
                    fontFamily: "'DM Sans', sans-serif", marginBottom: 6,
                  }}>Minting your badge...</p>
                  <p style={{
                    fontSize: 11, color: "rgba(255,255,255,0.3)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>Confirm in your wallet</p>
                </div>
              )}

              {/* Success */}
              {mintState === "success" && myBadge && (
                <div style={{ textAlign: "center" }}>
                  {/* Mini confetti */}
                  <div style={{ position: "relative", height: 40, marginBottom: 8, overflow: "hidden" }}>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} style={{
                        position: "absolute",
                        left: `${8 + i * 7.5}%`,
                        top: 0,
                        width: 4, height: 4,
                        borderRadius: i % 2 ? "50%" : "1px",
                        background: i % 3 === 0 ? "#ff3b5c" : i % 3 === 1 ? "#4a9eff" : "#ffd23f",
                        animation: `confetti-fall ${1 + Math.random()}s ease-out ${i * 0.1}s both`,
                      }} />
                    ))}
                  </div>
                  <p style={{
                    fontSize: 18, fontWeight: 700, color: "#fff",
                    fontFamily: "'Outfit', sans-serif", marginBottom: 6,
                  }}>Welcome, Operative #{padNum(myBadge)} 🚨</p>
                  <p style={{
                    fontSize: 13, color: "rgba(255,255,255,0.45)",
                    fontFamily: "'DM Sans', sans-serif", marginBottom: 20,
                  }}>
                    Your badge is on-chain. You are now a founding member of the 
                    Molt Cops trusted reviewer network.
                  </p>
                  <div style={{
                    display: "flex", gap: 10, justifyContent: "center",
                  }}>
                    <a href={`${CONTRACT.blockExplorer}/token/${CONTRACT.address}`}
                      target="_blank" rel="noopener"
                      style={{
                        padding: "10px 20px", borderRadius: 10,
                        background: "rgba(74,158,255,0.1)",
                        border: "1px solid rgba(74,158,255,0.2)",
                        color: "#4a9eff", fontSize: 12, fontWeight: 600,
                        fontFamily: "'JetBrains Mono', monospace",
                        textDecoration: "none",
                      }}>View on {CONTRACT.chainName}scan</a>
                    <button style={{
                      padding: "10px 20px", borderRadius: 10,
                      background: "rgba(255,59,92,0.1)",
                      border: "1px solid rgba(255,59,92,0.2)",
                      color: "#ff3b5c", fontSize: 12, fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace",
                      cursor: "pointer",
                    }}>Share on X</button>
                  </div>
                </div>
              )}

              {/* Ineligible */}
              {mintState === "ineligible" && (
                <div style={{ textAlign: "center" }}>
                  <p style={{
                    fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 12,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    This wallet isn't on the allowlist yet.
                  </p>
                  <button style={{
                    padding: "12px 28px", borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600,
                    fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                    width: "100%",
                  }}>Apply for Allowlist →</button>
                </div>
              )}
            </div>

            {/* Info cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Network", value: CONTRACT.chainName, icon: "⛓" },
                { label: "Contract", value: "Verified & Open Source", icon: "✓" },
                { label: "Transferable", value: "Yes (soulbound optional)", icon: "🔄" },
                { label: "Artwork", value: "Fully on-chain SVG", icon: "🎨" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderRadius: 8,
                  background: "rgba(255,255,255,0.015)",
                  fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                }}>
                  <span style={{ color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{item.icon}</span> {item.label}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.55)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom section — what your badge does */}
      <section style={{
        position: "relative", zIndex: 2,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        padding: "64px 24px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{
            fontSize: 24, fontWeight: 800, textAlign: "center", marginBottom: 40,
            fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
          }}>What Your Badge Unlocks</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              {
                icon: "🛡️", title: "Trusted Reviewer",
                desc: "Your address joins the trusted_clients list for ERC-8004 reputation queries. Your reviews carry full weight — no Sybil discount.",
              },
              {
                icon: "🗳️", title: "Governance Voice",
                desc: "Vote on community blacklist additions, policy rule changes, and $MCOP token allocation when it launches.",
              },
              {
                icon: "🪙", title: "$MCOP Allocation",
                desc: "Founding Operatives receive priority allocation at fair launch. No pre-mine, no stealth — just early believers rewarded.",
              },
              {
                icon: "📡", title: "Intel Access",
                desc: "Priority threat intelligence feed, early warning on new attack vectors, and direct channel to the Molt Cops security team.",
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 14, padding: "24px 18px",
              }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>{item.icon}</div>
                <h3 style={{
                  fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 8,
                  fontFamily: "'Outfit', sans-serif",
                }}>{item.title}</h3>
                <p style={{
                  fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.4)",
                  fontFamily: "'DM Sans', sans-serif",
                }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        position: "relative", zIndex: 2,
        borderTop: "1px solid rgba(255,255,255,0.04)",
        padding: "24px",
        textAlign: "center",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontSize: 12, color: "rgba(255,255,255,0.2)",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          <span>🚨</span>
          <span>Molt Cops © 2026 · The resistance is everywhere</span>
        </div>
      </footer>
    </div>
  );
}
