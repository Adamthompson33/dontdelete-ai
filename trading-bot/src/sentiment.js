// Sentiment Analysis - Uses Grok (X.AI) to analyze social signals on X
import fetch from 'node-fetch';
import config from './config.js';

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_API_KEY = config.xaiApiKey || process.env.XAI_API_KEY;

/**
 * Get sentiment analysis from Grok for a token
 */
export async function analyzeSentiment(tokenSymbol, tokenName) {
  if (!XAI_API_KEY) {
    console.log('[Sentiment] No XAI API key configured, skipping sentiment analysis');
    return null;
  }

  try {
    const prompt = `
Analyze the current sentiment on X for the token ${tokenName} (${tokenSymbol}).
Is this an organic community movement or does it look like a bot-driven pump?
Look for mentions from top crypto influencers or major whales.

Respond in JSON format:
{
  "sentimentScore": <1-10>,
  "organic": <true/false>,
  "botActivity": <"none"|"low"|"medium"|"high">,
  "influencerMentions": <true/false>,
  "summary": "<1 sentence summary>"
}`;

    const response = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-3',
        messages: [
          {
            role: 'system',
            content: 'You are a crypto sentiment analyst. Analyze social media sentiment for tokens with precision. Always respond in valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Sentiment] Grok API error:', error);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[Sentiment] No content in Grok response');
      return null;
    }

    // Parse JSON response
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const sentiment = JSON.parse(jsonMatch[0]);
        console.log(`[Sentiment] ${tokenSymbol}: Score ${sentiment.sentimentScore}/10, Organic: ${sentiment.organic}`);
        return sentiment;
      }
    } catch (parseErr) {
      console.error('[Sentiment] Failed to parse Grok response:', content);
    }

    return null;
  } catch (err) {
    console.error('[Sentiment] Error:', err.message);
    return null;
  }
}

/**
 * Get trending tokens from DexScreener boosts
 */
export async function getTrendingBoosted() {
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    const data = await response.json();
    
    // Filter for Solana tokens
    const solanaTokens = data.filter(t => t.chainId === 'solana');
    
    return solanaTokens.slice(0, 10).map(t => ({
      address: t.tokenAddress,
      symbol: t.symbol || 'UNKNOWN',
      name: t.name || 'UNKNOWN',
      boostAmount: t.amount,
      url: t.url,
    }));
  } catch (err) {
    console.error('[Sentiment] DexScreener boost error:', err.message);
    return [];
  }
}

/**
 * Full sentiment scan - gets boosted tokens and analyzes sentiment
 */
export async function runSentimentScan(maxTokens = 3) {
  console.log('[Sentiment] Starting Grok sentiment scan...');
  
  const boosted = await getTrendingBoosted();
  console.log(`[Sentiment] Found ${boosted.length} boosted Solana tokens`);
  
  const results = [];
  
  for (const token of boosted.slice(0, maxTokens)) {
    const sentiment = await analyzeSentiment(token.symbol, token.name);
    
    results.push({
      ...token,
      sentiment,
      timestamp: new Date().toISOString(),
    });
    
    // Rate limit - wait 1 second between requests
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return results;
}

// Run standalone
if (process.argv[1].endsWith('sentiment.js')) {
  console.log('[Sentiment] Running standalone sentiment scan...');
  const results = await runSentimentScan(3);
  console.log('\n[Sentiment] Results:', JSON.stringify(results, null, 2));
}

export default { analyzeSentiment, getTrendingBoosted, runSentimentScan };
