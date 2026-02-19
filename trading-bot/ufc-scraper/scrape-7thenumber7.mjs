/**
 * @7thenumber7 UFC Picks Scraper
 * Uses Grok's native X/Twitter access to pull UFC betting picks
 * and output structured JSON for cross-referencing with GG33 scores.
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('Missing XAI_API_KEY environment variable');
  process.exit(1);
}

const events = [
  {
    name: 'UFC 324: Gaethje vs Pimblett',
    date: '2026-01-24',
    searchWindow: { from: '2026-01-22', to: '2026-01-26' },
  },
  {
    name: 'UFC 325: Volkanovski vs Lopes 2',
    date: '2026-01-31',
    searchWindow: { from: '2026-01-29', to: '2026-02-02' },
  },
  {
    name: 'UFC FN: Bautista vs Oliveira',
    date: '2026-02-07',
    searchWindow: { from: '2026-02-05', to: '2026-02-09' },
  },
  {
    name: 'UFC FN: Strickland vs Hernandez',
    date: '2026-02-21',
    searchWindow: { from: '2026-02-19', to: '2026-02-22' },
  },
];

async function queryGrok(prompt, model = 'grok-3-mini') {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a sports betting research assistant. You have access to X/Twitter. 
When asked to find tweets, search X thoroughly and return ONLY valid JSON. 
No markdown, no code fences, no explanation — just the JSON array.
If you find no relevant tweets, return an empty array: []`,
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 4000,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  const cost = data.usage?.cost_in_usd_ticks;
  console.error(`  [Cost: $${(cost / 1_000_000_000).toFixed(4)}] [Tokens: ${data.usage?.total_tokens}]`);
  return content;
}

function parseJsonResponse(text) {
  // Try to extract JSON from response (handle markdown fences, etc.)
  let cleaned = text.trim();
  
  // Remove markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find JSON array in the text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        console.error('  Failed to parse JSON response:', cleaned.slice(0, 200));
        return [];
      }
    }
    return [];
  }
}

async function scrapeEvent(event) {
  console.error(`\n═══ Scraping: ${event.name} (${event.date}) ═══`);
  console.error(`  Window: ${event.searchWindow.from} to ${event.searchWindow.to}`);

  const prompt = `Search X/Twitter for tweets from the account @7thenumber7 (also known as "7 The Number 7" or "GG33" or "Gary the Numbers Guy") posted between ${event.searchWindow.from} and ${event.searchWindow.to} that mention UFC fighters, fight picks, parlays, betting odds, unit sizes, or fight predictions.

This account posts UFC betting picks using numerology/astrology analysis. Look for:
- Fighter names and who he's picking to win
- Parlay cards (multiple picks)  
- Unit sizes (e.g., "2u", "3 units")
- Odds mentioned (e.g., "+150", "-200")
- References to "lock", "lean", "fade", "stay away"
- Post-fight results ("cashed", "hit", "lost")
- Any mentions of zodiac signs, life paths, or numerology related to fighters

For each relevant tweet found, extract into this JSON format:
[
  {
    "tweet_date": "YYYY-MM-DD",
    "tweet_text": "the full or near-full tweet text",
    "event": "${event.name}",
    "picks": [
      {
        "fighter": "Fighter Name",
        "side": "win" | "lose" | "fade" | "over" | "under",
        "odds": "+150 or -200 if mentioned, null otherwise",
        "units": "number if mentioned, null otherwise",
        "confidence": "lock" | "lean" | "fade" | "stay_away" | "unknown",
        "method": "KO" | "sub" | "dec" | "any" | null,
        "reasoning": "any numerology/astrology reasoning mentioned"
      }
    ],
    "is_parlay": false,
    "is_result": false,
    "result_outcome": "win" | "loss" | "push" | null
  }
]

Return ONLY the JSON array. If no relevant tweets found, return [].`;

  const response = await queryGrok(prompt);
  const picks = parseJsonResponse(response);
  
  console.error(`  Found: ${picks.length} tweets`);
  return picks;
}

async function main() {
  console.error('═══════════════════════════════════════════════');
  console.error('  @7thenumber7 UFC Picks Scraper');
  console.error('  Using Grok API with native X access');
  console.error('═══════════════════════════════════════════════');

  const allPicks = [];
  let totalCost = 0;

  for (const event of events) {
    try {
      const picks = await scrapeEvent(event);
      allPicks.push(...picks);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 1000));
  }

  // Output the full dataset as JSON to stdout
  const output = {
    scrapeDate: new Date().toISOString(),
    account: '@7thenumber7',
    eventsScraped: events.length,
    totalTweets: allPicks.length,
    totalPicks: allPicks.reduce((sum, t) => sum + (t.picks?.length || 0), 0),
    tweets: allPicks,
  };

  console.log(JSON.stringify(output, null, 2));

  console.error(`\n═══ SUMMARY ═══`);
  console.error(`  Total tweets found: ${allPicks.length}`);
  console.error(`  Total picks extracted: ${output.totalPicks}`);
  console.error(`  Events covered: ${events.length}`);
  console.error(`  Output: stdout (pipe to file with > picks.json)`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
