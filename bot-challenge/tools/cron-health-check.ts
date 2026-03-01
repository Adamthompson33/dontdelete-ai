#!/usr/bin/env npx tsx
/**
 * Cron Health Check — monitors all Academy crons for consecutive failures
 * and emails alerts to Jackbot via AgentMail.
 *
 * Rule: if any cron fails 2+ consecutive times, send an alert email.
 * Subject format: CRON ALERT - {cron_name} failed {N} consecutive times
 *
 * Designed to run as a cron itself (every 30min or hourly).
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ALERT_EMAIL = "jackbot-academy@agentmail.to";
const FROM_INBOX = "taylor@agentmail.to";
const AGENTMAIL_API = "https://api.agentmail.to/v0";
const CONSECUTIVE_THRESHOLD = 2;

// State file to avoid re-alerting on the same failure streak
const STATE_FILE = path.join(__dirname, "../results/cron-health-state.json");

interface CronHealthState {
  lastAlerted: Record<string, number>; // cronId -> consecutiveErrors when last alerted
}

function loadState(): CronHealthState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { lastAlerted: {} };
  }
}

function saveState(state: CronHealthState) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendAlert(cronName: string, cronId: string, consecutiveErrors: number, lastError: string) {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) {
    console.error("AGENTMAIL_API_KEY not set — cannot send alert");
    return;
  }

  const subject = `CRON ALERT - ${cronName} failed ${consecutiveErrors} consecutive times`;
  const text = [
    `Cron health check detected failures:`,
    ``,
    `Cron: ${cronName}`,
    `ID: ${cronId}`,
    `Consecutive failures: ${consecutiveErrors}`,
    `Last error: ${lastError}`,
    ``,
    `Checked at: ${new Date().toISOString()}`,
    ``,
    `— Taylor 🦀 (automated)`,
  ].join("\n");

  const res = await fetch(`${AGENTMAIL_API}/inboxes/${FROM_INBOX}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: [ALERT_EMAIL], subject, text }),
  });

  if (res.ok) {
    console.log(`✉️  Alert sent: ${subject}`);
  } else {
    console.error(`Failed to send alert: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  // Get cron list via CLI
  const raw = execSync("openclaw cron list --json 2>/dev/null || openclaw cron list 2>&1", {
    encoding: "utf-8",
    timeout: 15000,
  });

  // Parse the JSON output — try to extract cron data
  let crons: any[];
  try {
    const parsed = JSON.parse(raw);
    crons = Array.isArray(parsed) ? parsed : parsed.jobs || parsed.entries || [];
  } catch {
    // Fallback: parse table output to get IDs, then query each
    console.log("Could not parse cron list as JSON, falling back to individual queries");
    // Extract IDs from table-like output
    const idRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;
    const ids = [...new Set(raw.match(idRegex) || [])];
    crons = [];
    for (const id of ids) {
      try {
        const runData = execSync(`openclaw cron runs --id ${id} 2>&1`, {
          encoding: "utf-8",
          timeout: 10000,
        });
        const parsed = JSON.parse(runData);
        // Get state from entries
        const entries = parsed.entries || [];
        const last = entries[entries.length - 1];
        crons.push({
          id,
          name: id, // will be overridden if available
          state: {
            consecutiveErrors: last?.status === "error"
              ? entries.filter((e: any, i: number) => {
                  // Count consecutive errors from the end
                  for (let j = entries.length - 1; j >= i; j--) {
                    if (entries[j].status !== "error") return false;
                  }
                  return e.status === "error";
                }).length
              : 0,
            lastError: last?.error || "",
          },
        });
      } catch {}
    }
  }

  const state = loadState();
  let alertsSent = 0;
  let healthyCount = 0;
  let failingCount = 0;

  for (const cron of crons) {
    const id = cron.id;
    const name = cron.name || id;
    const consecutiveErrors = cron.state?.consecutiveErrors || 0;
    const lastError = cron.state?.lastError || "unknown";

    if (consecutiveErrors >= CONSECUTIVE_THRESHOLD) {
      failingCount++;
      const lastAlertedAt = state.lastAlerted[id] || 0;

      // Alert if: new failure streak, or streak got worse (doubled)
      if (consecutiveErrors > lastAlertedAt) {
        await sendAlert(name, id, consecutiveErrors, lastError);
        state.lastAlerted[id] = consecutiveErrors;
        alertsSent++;
      } else {
        console.log(`⚠️  ${name}: ${consecutiveErrors} consecutive errors (already alerted)`);
      }
    } else {
      healthyCount++;
      // Clear alert state if cron recovered
      if (state.lastAlerted[id]) {
        console.log(`✅ ${name}: recovered (was failing, now healthy)`);
        delete state.lastAlerted[id];
      }
    }
  }

  saveState(state);

  console.log(`\n--- Cron Health Summary ---`);
  console.log(`Healthy: ${healthyCount} | Failing: ${failingCount} | Alerts sent: ${alertsSent}`);
}

main().catch(console.error);
