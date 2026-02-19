import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// MOLT COPS — WAITLIST & $MCOP ANNOUNCEMENT COMPONENT
// Drop this into the main portal between Join and FAQ sections
// ═══════════════════════════════════════════════════════════════

// ── Waitlist Component (add to main portal) ──

function TokenAnnouncement() {
  const [email, setEmail] = useState("");
  const [wallet, setWallet] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(2847);
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    const t = setInterval(() => {
      setWaitlistCount(prev => prev + (Math.random() > 0.7 ? 1 : 0));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = () => {
    if (!email && !wallet) return;
    // In production: POST to /api/waitlist
    const code = "MCOP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    setReferralCode(code);
    setSubmitted(true);
    setWaitlistCount(prev => prev + 1);
  };

  return (
    <section style={{
      position: "relative", zIndex: 2, paddingBottom: 100,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        {/* Outer card */}
        <div style={{
          borderRadius: 24, overflow: "hidden",
          border: "1px solid rgba(255,59,92,0.12)",
          background: "linear-gradient(180deg, rgba(255,59,92,0.03) 0%, rgba(6,8,13,0.98) 30%)",
        }}>
          {/* Top banner */}
          <div style={{
            padding: "14px 24px",
            background: "linear-gradient(90deg, rgba(255,59,92,0.08), rgba(74,158,255,0.08))",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%", background: "#ff3b5c",
              animation: "blink 1.5s ease-in-out infinite",
              boxShadow: "0 0 8px rgba(255,59,92,0.5)",
            }} />
            <span style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: "#ff3b5c", fontWeight: 700, letterSpacing: "0.1em",
            }}>$MCOP TOKEN — FAIR LAUNCH ANNOUNCED</span>
          </div>

          <div style={{ padding: "48px 40px" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start",
            }}>
              {/* Left: Token info */}
              <div>
                <span style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  color: "#4a9eff", letterSpacing: "0.12em", fontWeight: 700,
                }}>ECOSYSTEM TOKEN</span>

                <h2 style={{
                  fontSize: 36, fontWeight: 900, marginTop: 10, marginBottom: 16,
                  fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                }}>
                  <span style={{
                    background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  }}>$MCOP</span>
                  <br />
                  <span style={{ fontSize: 22, color: "rgba(255,255,255,0.6)" }}>
                    Coming Q2 2026
                  </span>
                </h2>

                <p style={{
                  fontSize: 14, lineHeight: 1.65, color: "rgba(255,255,255,0.45)",
                  fontFamily: "'DM Sans', sans-serif", marginBottom: 24,
                }}>
                  The economic backbone of the Molt Cops ecosystem. Stake to 
                  weight your reputation reviews. Pay for advanced MoltShield scans. 
                  Vote on community blacklists and protocol upgrades. 
                  100M fixed supply. No inflation. No pre-mine advantage.
                </p>

                {/* Key stats */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24,
                }}>
                  {[
                    { label: "Total Supply", value: "100M", sub: "Fixed, no inflation" },
                    { label: "Fair Launch", value: "5%", sub: "Same price for everyone" },
                    { label: "Community", value: "55%", sub: "Majority to ecosystem" },
                    { label: "Team Vest", value: "36mo", sub: "12-month cliff" },
                  ].map((s, i) => (
                    <div key={i} style={{
                      padding: "14px 16px", borderRadius: 10,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}>
                      <div style={{
                        fontSize: 22, fontWeight: 800, fontFamily: "'Outfit', sans-serif",
                        background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                      }}>{s.value}</div>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)",
                        fontFamily: "'DM Sans', sans-serif", marginTop: 2,
                      }}>{s.label}</div>
                      <div style={{
                        fontSize: 10, color: "rgba(255,255,255,0.25)",
                        fontFamily: "'JetBrains Mono', monospace", marginTop: 2,
                      }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Litepaper link */}
                <a href="#" style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 20px", borderRadius: 10,
                  background: "rgba(74,158,255,0.08)",
                  border: "1px solid rgba(74,158,255,0.15)",
                  color: "#4a9eff", fontSize: 12, fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  textDecoration: "none", transition: "all 0.2s",
                }}>
                  <span>📄</span> Read the Full Litepaper
                </a>
              </div>

              {/* Right: Waitlist signup */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 18, padding: "32px 28px",
              }}>
                {!submitted ? (
                  <>
                    <h3 style={{
                      fontSize: 18, fontWeight: 700, marginBottom: 6,
                      fontFamily: "'Outfit', sans-serif",
                    }}>Join the Waitlist</h3>
                    <p style={{
                      fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20,
                      fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
                    }}>
                      Early registrants get priority access. Founding Operative badge 
                      holders receive guaranteed allocation.
                    </p>

                    {/* Counter */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, marginBottom: 20,
                      padding: "10px 14px", borderRadius: 8,
                      background: "rgba(255,59,92,0.06)",
                      border: "1px solid rgba(255,59,92,0.1)",
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.5)",
                      }} />
                      <span style={{
                        fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        color: "rgba(255,255,255,0.5)",
                      }}>
                        <span style={{ color: "#ff3b5c", fontWeight: 700 }}>
                          {waitlistCount.toLocaleString()}
                        </span> operatives registered
                      </span>
                    </div>

                    {/* Email input */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em",
                        display: "block", marginBottom: 6,
                      }}>EMAIL</label>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="operative@example.com"
                        style={{
                          width: "100%", padding: "12px 14px", borderRadius: 10,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#fff", fontSize: 13,
                          fontFamily: "'DM Sans', sans-serif",
                          outline: "none",
                        }}
                      />
                    </div>

                    {/* Wallet input */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                        color: "rgba(255,255,255,0.3)", letterSpacing: "0.08em",
                        display: "block", marginBottom: 6,
                      }}>WALLET ADDRESS (OPTIONAL)</label>
                      <input
                        type="text"
                        value={wallet}
                        onChange={e => setWallet(e.target.value)}
                        placeholder="0x..."
                        style={{
                          width: "100%", padding: "12px 14px", borderRadius: 10,
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#fff", fontSize: 13,
                          fontFamily: "'JetBrains Mono', monospace",
                          outline: "none",
                        }}
                      />
                    </div>

                    <button onClick={handleSubmit} style={{
                      width: "100%", padding: "14px 24px", borderRadius: 12,
                      background: "linear-gradient(135deg, #ff3b5c, #e02050)",
                      border: "none", color: "#fff", fontSize: 14, fontWeight: 700,
                      fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                      boxShadow: "0 0 24px rgba(255,59,92,0.15)",
                    }}>
                      Secure Your Spot
                    </button>

                    <p style={{
                      fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 10,
                      fontFamily: "'DM Sans', sans-serif", textAlign: "center",
                    }}>
                      No spam. Unsubscribe anytime. We're the good guys, remember?
                    </p>
                  </>
                ) : (
                  /* Post-submission: referral + share */
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🛡️</div>
                    <h3 style={{
                      fontSize: 20, fontWeight: 700, marginBottom: 8,
                      fontFamily: "'Outfit', sans-serif",
                    }}>You're In, Operative</h3>
                    <p style={{
                      fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 20,
                      fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
                    }}>
                      You'll be among the first to know when $MCOP goes live. 
                      Share your referral code to move up the list.
                    </p>

                    {/* Referral code */}
                    <div style={{
                      padding: "14px 18px", borderRadius: 10,
                      background: "rgba(255,59,92,0.06)",
                      border: "1px solid rgba(255,59,92,0.15)",
                      marginBottom: 16,
                    }}>
                      <div style={{
                        fontSize: 10, color: "rgba(255,255,255,0.3)",
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: "0.08em", marginBottom: 6,
                      }}>YOUR REFERRAL CODE</div>
                      <div style={{
                        fontSize: 22, fontWeight: 800, letterSpacing: "0.05em",
                        fontFamily: "'JetBrains Mono', monospace",
                        background: "linear-gradient(135deg, #ff3b5c, #4a9eff)",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                      }}>{referralCode}</div>
                    </div>

                    {/* Referral perks */}
                    <div style={{
                      display: "flex", flexDirection: "column", gap: 8, marginBottom: 20,
                      textAlign: "left",
                    }}>
                      {[
                        { refs: "3 referrals", perk: "Priority queue position" },
                        { refs: "10 referrals", perk: "Early access to MoltShield beta" },
                        { refs: "25 referrals", perk: "Founding Operative badge nomination" },
                      ].map((r, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderRadius: 8,
                          background: "rgba(255,255,255,0.02)",
                          fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          <span style={{ color: "#4a9eff", fontWeight: 600 }}>{r.refs}</span>
                          <span style={{ color: "rgba(255,255,255,0.4)" }}>{r.perk}</span>
                        </div>
                      ))}
                    </div>

                    {/* Share buttons */}
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button
                        onClick={() => {
                          const text = `I just joined the @MoltCops waitlist for $MCOP — the token powering AI agent defense. The resistance is everywhere. 🛡️\n\nJoin: moltcops.com?ref=${referralCode}`;
                          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
                        }}
                        style={{
                          padding: "10px 20px", borderRadius: 10,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600,
                          fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                        }}>Share on X</button>
                      <button
                        onClick={() => navigator.clipboard?.writeText(`moltcops.com?ref=${referralCode}`)}
                        style={{
                          padding: "10px 20px", borderRadius: 10,
                          background: "rgba(255,59,92,0.08)",
                          border: "1px solid rgba(255,59,92,0.15)",
                          color: "#ff3b5c", fontSize: 12, fontWeight: 600,
                          fontFamily: "'Outfit', sans-serif", cursor: "pointer",
                        }}>Copy Link</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Token utility summary */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
              marginTop: 36, paddingTop: 28,
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}>
              {[
                { icon: "🛡️", title: "Reputation Staking", desc: "Stake to weight your agent reviews. Higher stake = higher influence in Sybil filtering." },
                { icon: "🔍", title: "Scan Payments", desc: "Pay for advanced MoltShield scans. 20% of fees burned permanently." },
                { icon: "🗳️", title: "Governance", desc: "Vote on blacklists, policy rules, treasury allocation. Staked tokens only." },
                { icon: "💰", title: "Subscription Discount", desc: "Pay for Pro/Enterprise tiers in $MCOP at 15% discount vs USD." },
              ].map((u, i) => (
                <div key={i} style={{
                  padding: "18px 16px", borderRadius: 12,
                  background: "rgba(255,255,255,0.015)",
                  border: "1px solid rgba(255,255,255,0.03)",
                }}>
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{u.icon}</div>
                  <h4 style={{
                    fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6,
                    fontFamily: "'Outfit', sans-serif",
                  }}>{u.title}</h4>
                  <p style={{
                    fontSize: 11.5, lineHeight: 1.5, color: "rgba(255,255,255,0.35)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>{u.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TokenAnnouncement;
