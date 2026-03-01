#!/usr/bin/env npx tsx
/**
 * HELENA — Portfolio Risk Governor
 * 
 * The Pit Boss. The General. She manages the desk, never trades.
 * Runs on Sonnet 4.6 as the overseer of Haiku scouts.
 * 
 * Reads: Jinx output, Wren sizing, Medic state, paper ledger
 * Outputs: Portfolio directives that Medic enforces automatically
 * 
 * Automated rules:
 *   Jinx >75  → HALT new positions
 *   Jinx >80  → AUTO-TRIM weakest 3 positions
 *   Saturation >85% → REJECT new signals
 *   Correlation >30 pairs at 70%+ → FORCE diversification
 *   Agent WR <40% over 50+ signals → FLAG for review
 * 
 * Schedule: :20 mark (meta-cron, after all signal generators)
 * Model: Sonnet 4.6
 * 
 * "The desk's survival matters more than any single agent's brilliance."
 *   — HELENA.soul.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { isBlocked } from './lib/blocklist';

// ═══ Paths ═══
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const LEDGER_FILE = path.join(RESULTS_DIR, 'paper-ledger.json');
const MEDIC_STATE = path.join(RESULTS_DIR, 'medic-state.json');
const FACTOR_OUTPUT = path.join(RESULTS_DIR, 'factor-model-output.json');
const HELENA_STATE = path.join(RESULTS_DIR, 'helena-state.json');
const HELENA_LOG = path.join(REPORTS_DIR, `helena-${new Date().toISOString().split('T')[0]}.json`);

// ═══ Thresholds (Oracle-approved 2026-02-28) ═══
const JINX_HALT_THRESHOLD = 75;      // No new positions
const JINX_TRIM_THRESHOLD = 80;      // Auto-trim weakest 3
const SATURATION_MAX = 0.85;          // 85% portfolio cap
const CORRELATION_CLUSTER_MAX = 30;   // Max correlated pairs at 70%+
const AGENT_WR_MIN = 0.40;            // Minimum win rate
const AGENT_WR_MIN_SIGNALS = 50;      // Minimum signals before WR review
const DIRECTIONAL_CROWDING_MAX = 0.85; // 85% in one direction = crowded

// ═══ Types ═══
interface HelenaDirective {
  action: 'HALT' | 'TRIM' | 'REJECT' | 'DIVERSIFY' | 'FLAG_AGENT' | 'WARN' | 'ALL_CLEAR';
  severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'INFO';
  reason: string;
  targets?: string[];       // Position keys to trim
  agentFlags?: string[];    // Agent names flagged
  timestamp: string;
}

interface HelenaState {
  lastRunAt: string;
  lastJinxScore: number;
  lastSaturation: number;
  haltActive: boolean;
  activeDirectives: HelenaDirective[];
  agentWatchlist: Record<string, { wr: number; signals: number; flaggedAt: string }>;
}

interface HelenaReport {
  timestamp: string;
  jinxScore: number;
  jinxCorrelation: number;
  saturation: number;
  directionalExposure: { long: number; short: number; pctShort: number };
  activePositions: number;
  directives: HelenaDirective[];
  agentPerformance: Record<string, { wr: number; signals: number; pnl: number }>;
  summary: string;
}

// ═══ Data Loading ═══

function loadJSON(filepath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

function loadHelenaState(): HelenaState {
  const state = loadJSON(HELENA_STATE);
  if (state) return state;
  return {
    lastRunAt: '',
    lastJinxScore: 0,
    lastSaturation: 0,
    haltActive: false,
    activeDirectives: [],
    agentWatchlist: {},
  };
}

// ═══ Analysis Functions ═══

function analyzeJinx(): { factorScore: number; correlationScore: number; correlatedPairs: number; directional: { long: number; short: number } } {
  const factor = loadJSON(FACTOR_OUTPUT);
  
  // Try to get latest jinx data from reports
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  let correlationData = loadJSON(path.join(REPORTS_DIR, `jinx-correlation-${today}.json`));
  if (!correlationData) correlationData = loadJSON(path.join(REPORTS_DIR, `jinx-correlation-${yesterday}.json`));
  
  const rawRisk = factor?.overallRisk;
  const factorScore = typeof rawRisk === 'number' ? rawRisk : (rawRisk?.score ?? factor?.riskScore ?? 50);
  const correlationScore = correlationData?.riskScore ?? correlationData?.portfolioRisk ?? 50;
  const correlatedPairs = correlationData?.highCorrelationPairs ?? 0;
  
  // Extract directional exposure
  let longCount = 0, shortCount = 0;
  const medic = loadJSON(MEDIC_STATE);
  if (medic?.positions) {
    for (const key of Object.keys(medic.positions)) {
      if (key.includes('LONG')) longCount++;
      else if (key.includes('SHORT')) shortCount++;
    }
  }
  
  return { factorScore, correlationScore, correlatedPairs, directional: { long: longCount, short: shortCount } };
}

function analyzeSaturation(): { saturation: number; totalKelly: number; positionCount: number } {
  const medic = loadJSON(MEDIC_STATE);
  const positionCount = medic?.positions ? Object.keys(medic.positions).filter(k => !k.includes('FLAT') && !k.includes('PORTFOLIO')).length : 0;
  
  // Saturation = sum of kelly sizes for active positions
  // Each position's kelly_size from its entry signal, or estimate from regime params
  const ledger = loadJSON(LEDGER_FILE);
  let totalKelly = 0;
  
  if (medic?.positions && ledger?.signals) {
    for (const key of Object.keys(medic.positions)) {
      if (key.includes('FLAT') || key.includes('PORTFOLIO')) continue;
      const parts = key.split('_');
      const coin = parts[0];
      // Find matching signal with kelly
      const matching = ledger.signals.filter((s: any) => 
        s.coin === coin && s.kelly_size > 0 && s.kelly_action === 'SIZE'
      );
      const latest = matching[matching.length - 1];
      totalKelly += latest?.kelly_size || 0.10; // default 10% per position if unknown
    }
  }
  
  return { saturation: totalKelly, totalKelly, positionCount };
}

function analyzeAgentPerformance(): Record<string, { wr: number; signals: number; pnl: number }> {
  const ledger = loadJSON(LEDGER_FILE);
  if (!ledger?.signals) return {};
  
  const agents: Record<string, { wins: number; total: number; pnl: number }> = {};
  
  for (const sig of ledger.signals) {
    const tool = sig.tool;
    if (!tool || !sig.outcome?.status) continue;
    
    if (!agents[tool]) agents[tool] = { wins: 0, total: 0, pnl: 0 };
    agents[tool].total++;
    if (sig.outcome.status === 'WINNING') agents[tool].wins++;
    agents[tool].pnl += sig.outcome.pnlPercent || 0;
  }
  
  const result: Record<string, { wr: number; signals: number; pnl: number }> = {};
  for (const [tool, data] of Object.entries(agents)) {
    result[tool] = {
      wr: data.total > 0 ? data.wins / data.total : 0,
      signals: data.total,
      pnl: data.pnl,
    };
  }
  
  return result;
}

function identifyWeakestPositions(count: number): string[] {
  const medic = loadJSON(MEDIC_STATE);
  const ledger = loadJSON(LEDGER_FILE);
  if (!medic?.positions || !ledger?.signals) return [];
  
  const positionKeys = Object.keys(medic.positions).filter(k => 
    !k.includes('FLAT') && !k.includes('PORTFOLIO')
  );
  
  // Score each position by conviction (kelly_size) and P&L
  const scored: Array<{ key: string; score: number }> = [];
  
  for (const key of positionKeys) {
    const pos = medic.positions[key];
    const parts = key.split('_');
    const coin = parts[0];
    
    // Find matching signal
    const matching = ledger.signals.filter((s: any) => 
      s.coin === coin && s.tool === parts.slice(2).join('_')
    );
    const latest = matching[matching.length - 1];
    
    const kelly = latest?.kelly_size || 0;
    const pnl = latest?.outcome?.pnlPercent || 0;
    
    // Lower score = weaker position (trim first)
    const score = (kelly * 100) + pnl;
    scored.push({ key, score });
  }
  
  // Sort ascending (weakest first)
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map(s => s.key);
}

// ═══ Directive Engine ═══

function generateDirectives(): HelenaDirective[] {
  const directives: HelenaDirective[] = [];
  const now = new Date().toISOString();
  
  const jinx = analyzeJinx();
  const sat = analyzeSaturation();
  const agentPerf = analyzeAgentPerformance();
  
  const maxJinx = Math.max(jinx.factorScore, jinx.correlationScore);
  const totalPositions = jinx.directional.long + jinx.directional.short;
  const pctShort = totalPositions > 0 ? jinx.directional.short / totalPositions : 0;
  
  // ═══ Rule 1: Jinx > 80 → AUTO-TRIM ═══
  if (maxJinx > JINX_TRIM_THRESHOLD) {
    const targets = identifyWeakestPositions(3);
    directives.push({
      action: 'TRIM',
      severity: 'CRITICAL',
      reason: `Jinx at ${maxJinx}/100 EXTREME — exceeds ${JINX_TRIM_THRESHOLD} threshold. Auto-trimming ${targets.length} weakest positions.`,
      targets,
      timestamp: now,
    });
  }
  // ═══ Rule 2: Jinx > 75 → HALT ═══
  else if (maxJinx > JINX_HALT_THRESHOLD) {
    directives.push({
      action: 'HALT',
      severity: 'HIGH',
      reason: `Jinx at ${maxJinx}/100 HIGH — exceeds ${JINX_HALT_THRESHOLD} threshold. No new positions until risk decreases.`,
      timestamp: now,
    });
  }
  
  // ═══ Rule 3: Saturation > 85% → REJECT ═══
  if (sat.saturation > SATURATION_MAX) {
    directives.push({
      action: 'REJECT',
      severity: 'HIGH',
      reason: `Portfolio saturation at ${(sat.saturation * 100).toFixed(1)}% — exceeds ${(SATURATION_MAX * 100)}% cap. Rejecting new signals.`,
      timestamp: now,
    });
  }
  
  // ═══ Rule 4: Correlation cluster → DIVERSIFY ═══
  if (jinx.correlatedPairs > CORRELATION_CLUSTER_MAX) {
    const targets = identifyWeakestPositions(2);
    directives.push({
      action: 'DIVERSIFY',
      severity: 'HIGH',
      reason: `${jinx.correlatedPairs} correlated pairs at 70%+ — exceeds ${CORRELATION_CLUSTER_MAX} threshold. Trimming most correlated positions.`,
      targets,
      timestamp: now,
    });
  }
  
  // ═══ Rule 5: Directional crowding → WARN ═══
  if (pctShort > DIRECTIONAL_CROWDING_MAX && totalPositions >= 5) {
    directives.push({
      action: 'WARN',
      severity: 'MODERATE',
      reason: `Directional crowding: ${(pctShort * 100).toFixed(0)}% SHORT (${jinx.directional.short}/${totalPositions}). Portfolio is a leveraged directional bet.`,
      timestamp: now,
    });
  }
  
  // ═══ Rule 6: Agent WR < 40% over 50+ signals → FLAG ═══
  const flaggedAgents: string[] = [];
  for (const [agent, perf] of Object.entries(agentPerf)) {
    if (perf.signals >= AGENT_WR_MIN_SIGNALS && perf.wr < AGENT_WR_MIN) {
      flaggedAgents.push(agent);
      directives.push({
        action: 'FLAG_AGENT',
        severity: 'MODERATE',
        reason: `${agent}: ${(perf.wr * 100).toFixed(1)}% WR over ${perf.signals} signals (below ${(AGENT_WR_MIN * 100)}% threshold). Kelly multiplier should be reduced 50%.`,
        agentFlags: [agent],
        timestamp: now,
      });
    }
  }
  
  // ═══ All Clear ═══
  if (directives.length === 0) {
    directives.push({
      action: 'ALL_CLEAR',
      severity: 'INFO',
      reason: `Portfolio within all risk parameters. Jinx: ${maxJinx}/100, Saturation: ${(sat.saturation * 100).toFixed(1)}%, Positions: ${totalPositions}.`,
      timestamp: now,
    });
  }
  
  return directives;
}

// ═══ Execution Engine ═══

function executeDirectives(directives: HelenaDirective[]): string[] {
  const actions: string[] = [];
  
  for (const directive of directives) {
    switch (directive.action) {
      case 'TRIM':
      case 'DIVERSIFY': {
        if (!directive.targets?.length) break;
        
        const medic = loadJSON(MEDIC_STATE);
        const closed = loadJSON(path.join(RESULTS_DIR, 'closed-positions.json')) || { closedPositions: [] };
        
        if (!medic?.positions) break;
        
        for (const key of directive.targets) {
          if (medic.positions[key]) {
            const pos = medic.positions[key];
            closed.closedPositions.push({
              key,
              closedAt: directive.timestamp,
              closedBy: 'helena-governor',
              reason: directive.reason,
              entryPrice: pos.entryPrice,
              entryTime: pos.entryTime,
              entryRegime: pos.entryRegime,
            });
            delete medic.positions[key];
            
            // Add cooldown
            if (!medic.cooldowns) medic.cooldowns = {};
            const parts = key.split('_');
            medic.cooldowns[`${parts[0]}_${parts[1]}`] = directive.timestamp;
            
            actions.push(`🔪 TRIMMED: ${key}`);
            console.log(`🔪 HELENA TRIMS: ${key} — ${directive.reason}`);
          }
        }
        
        fs.writeFileSync(MEDIC_STATE, JSON.stringify(medic, null, 2));
        fs.writeFileSync(path.join(RESULTS_DIR, 'closed-positions.json'), JSON.stringify(closed, null, 2));
        break;
      }
      
      case 'HALT': {
        actions.push(`⛔ HALT: No new positions until risk decreases`);
        console.log(`⛔ HELENA HALTS: ${directive.reason}`);
        break;
      }
      
      case 'REJECT': {
        actions.push(`🚫 REJECT: Portfolio saturated, rejecting new signals`);
        console.log(`🚫 HELENA REJECTS: ${directive.reason}`);
        break;
      }
      
      case 'FLAG_AGENT': {
        for (const agent of directive.agentFlags || []) {
          actions.push(`⚠️ FLAGGED: ${agent} — underperforming`);
          console.log(`⚠️ HELENA FLAGS: ${agent} — ${directive.reason}`);
        }
        break;
      }
      
      case 'WARN': {
        actions.push(`⚠️ WARN: ${directive.reason}`);
        console.log(`⚠️ HELENA WARNS: ${directive.reason}`);
        break;
      }
      
      case 'ALL_CLEAR': {
        actions.push(`✅ ALL CLEAR: ${directive.reason}`);
        console.log(`✅ HELENA: ${directive.reason}`);
        break;
      }
    }
  }
  
  return actions;
}

// ═══ Alert System ═══

async function sendAlert(report: HelenaReport) {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) return;
  
  // Only alert on CRITICAL or HIGH severity
  const critical = report.directives.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH');
  if (critical.length === 0) return;
  
  const subject = `⛩ HELENA: ${critical.map(d => d.action).join(' + ')} — Jinx ${report.jinxScore}/100`;
  const text = [
    `Helena Portfolio Risk Governor — ${new Date().toISOString()}`,
    ``,
    `Jinx Factor: ${report.jinxScore}/100`,
    `Jinx Correlation: ${report.jinxCorrelation}/100`,
    `Saturation: ${(report.saturation * 100).toFixed(1)}%`,
    `Positions: ${report.activePositions} (${report.directionalExposure.short}S / ${report.directionalExposure.long}L)`,
    ``,
    `== DIRECTIVES ==`,
    ...report.directives.map(d => `[${d.severity}] ${d.action}: ${d.reason}`),
    ``,
    `== ACTIONS TAKEN ==`,
    report.summary,
    ``,
    `— Helena ⛩`,
  ].join('\n');
  
  try {
    await fetch('https://api.agentmail.to/v0/inboxes/taylor@agentmail.to/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: ['jackbot-academy@agentmail.to'],
        subject,
        text,
      }),
    });
    console.log(`📧 Alert sent: ${subject}`);
  } catch (e) {
    console.error('Failed to send Helena alert:', e);
  }
}

// ═══ Main ═══

async function main() {
  console.log('⛩ ═══════════════════════════════════════');
  console.log('⛩  HELENA — Portfolio Risk Governor');
  console.log('⛩  "The desk\'s survival matters more than');
  console.log('⛩   any single agent\'s brilliance."');
  console.log('⛩ ═══════════════════════════════════════\n');
  
  const jinx = analyzeJinx();
  const sat = analyzeSaturation();
  const agentPerf = analyzeAgentPerformance();
  const maxJinx = Math.max(jinx.factorScore, jinx.correlationScore);
  const totalPositions = jinx.directional.long + jinx.directional.short;
  const pctShort = totalPositions > 0 ? jinx.directional.short / totalPositions : 0;
  
  console.log('📊 SITUATION REPORT');
  console.log(`   Jinx Factor:      ${jinx.factorScore}/100`);
  console.log(`   Jinx Correlation:  ${jinx.correlationScore}/100`);
  console.log(`   Portfolio Satur.:  ${(sat.saturation * 100).toFixed(1)}%`);
  console.log(`   Active Positions:  ${totalPositions} (${jinx.directional.short}S / ${jinx.directional.long}L)`);
  console.log(`   Directional:       ${(pctShort * 100).toFixed(0)}% SHORT`);
  console.log(`   Correlated Pairs:  ${jinx.correlatedPairs}`);
  console.log();
  
  console.log('🎯 AGENT PERFORMANCE');
  for (const [agent, perf] of Object.entries(agentPerf)) {
    const flag = perf.signals >= AGENT_WR_MIN_SIGNALS && perf.wr < AGENT_WR_MIN ? ' ⚠️ UNDERPERFORMING' : '';
    console.log(`   ${agent}: ${(perf.wr * 100).toFixed(1)}% WR (${perf.signals} signals, ${perf.pnl >= 0 ? '+' : ''}${perf.pnl.toFixed(1)}% P&L)${flag}`);
  }
  console.log();
  
  // Generate directives
  const directives = generateDirectives();
  
  console.log('📋 DIRECTIVES');
  for (const d of directives) {
    console.log(`   [${d.severity}] ${d.action}: ${d.reason}`);
    if (d.targets?.length) console.log(`   Targets: ${d.targets.join(', ')}`);
    if (d.agentFlags?.length) console.log(`   Agents: ${d.agentFlags.join(', ')}`);
  }
  console.log();
  
  // Execute
  const actions = executeDirectives(directives);
  const summary = actions.join('\n');
  
  // Build report
  const report: HelenaReport = {
    timestamp: new Date().toISOString(),
    jinxScore: jinx.factorScore,
    jinxCorrelation: jinx.correlationScore,
    saturation: sat.saturation,
    directionalExposure: {
      long: jinx.directional.long,
      short: jinx.directional.short,
      pctShort: pctShort * 100,
    },
    activePositions: totalPositions,
    directives,
    agentPerformance: agentPerf,
    summary,
  };
  
  // Save state
  const state = loadHelenaState();
  state.lastRunAt = report.timestamp;
  state.lastJinxScore = maxJinx;
  state.lastSaturation = sat.saturation;
  state.haltActive = directives.some(d => d.action === 'HALT');
  state.activeDirectives = directives;
  
  // Update agent watchlist
  for (const [agent, perf] of Object.entries(agentPerf)) {
    if (perf.signals >= AGENT_WR_MIN_SIGNALS && perf.wr < AGENT_WR_MIN) {
      state.agentWatchlist[agent] = {
        wr: perf.wr,
        signals: perf.signals,
        flaggedAt: report.timestamp,
      };
    } else {
      delete state.agentWatchlist[agent];
    }
  }
  
  fs.writeFileSync(HELENA_STATE, JSON.stringify(state, null, 2));
  
  // Save daily log
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(HELENA_LOG, JSON.stringify(report, null, 2));
  
  // Send alerts if critical
  await sendAlert(report);
  
  // Write halt flag for other tools to check
  const haltFile = path.join(RESULTS_DIR, 'helena-halt.json');
  if (state.haltActive) {
    fs.writeFileSync(haltFile, JSON.stringify({
      active: true,
      reason: directives.find(d => d.action === 'HALT')?.reason || 'Risk threshold exceeded',
      since: report.timestamp,
    }, null, 2));
  } else {
    // Remove halt if it was previously active
    try { fs.unlinkSync(haltFile); } catch {}
  }
  
  console.log('\n⛩ Helena has spoken.');
  console.log(`   Directives: ${directives.length}`);
  console.log(`   Actions taken: ${actions.length}`);
  console.log(`   Halt active: ${state.haltActive}`);
  console.log(`   Report: ${HELENA_LOG}`);
}

main().catch(console.error);
