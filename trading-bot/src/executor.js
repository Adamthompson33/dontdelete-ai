// Trade Executor - Jupiter swap execution
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { readFileSync } from 'fs';
import fetch from 'node-fetch';
import config from './config.js';

const JUPITER_QUOTE_API = 'https://api.jup.ag/swap/v1';
const JUPITER_SWAP_API = 'https://api.jup.ag/swap/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`;

let connection = null;
let wallet = null;

/**
 * Initialize connection and wallet
 */
export function initWallet() {
  if (!connection) {
    connection = new Connection(HELIUS_RPC, 'confirmed');
  }
  
  if (!wallet) {
    try {
      const secretKey = JSON.parse(readFileSync(config.walletPath, 'utf-8'));
      wallet = Keypair.fromSecretKey(new Uint8Array(secretKey));
      console.log(`[Executor] Wallet loaded: ${wallet.publicKey.toString()}`);
    } catch (err) {
      console.error('[Executor] Failed to load wallet:', err.message);
    }
  }
  
  return { connection, wallet };
}

/**
 * Get wallet SOL balance
 */
export async function getBalance() {
  const { connection, wallet } = initWallet();
  if (!wallet) return 0;
  
  const balance = await connection.getBalance(wallet.publicKey);
  return balance / 1e9; // Convert lamports to SOL
}

/**
 * Get Jupiter quote for swap
 */
export async function getQuote(inputMint, outputMint, amountLamports) {
  try {
    const url = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=50`;
    
    const res = await fetch(url, {
      headers: {
        'x-api-key': config.jupiterApiKey,
        'Content-Type': 'application/json',
      }
    });
    const quote = await res.json();
    
    if (quote.error) {
      console.error('[Executor] Quote error:', quote.error);
      return null;
    }
    
    return quote;
  } catch (err) {
    console.error('[Executor] Quote fetch error:', err.message);
    return null;
  }
}

/**
 * Execute swap via Jupiter
 */
export async function executeSwap(quote) {
  if (config.paperTrading) {
    console.log('[Executor] PAPER TRADE - Would execute swap:', {
      inputMint: quote.inputMint,
      outputMint: quote.outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
    });
    return { success: true, paper: true, quote };
  }
  
  const { connection, wallet } = initWallet();
  if (!wallet) {
    return { success: false, error: 'Wallet not loaded' };
  }
  
  try {
    // Get swap transaction
    const swapRes = await fetch(`${JUPITER_SWAP_API}/swap`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': config.jupiterApiKey,
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 100000, // High priority for fast execution
      }),
    });
    
    const swapData = await swapRes.json();
    
    if (swapData.error) {
      return { success: false, error: swapData.error };
    }
    
    // Deserialize and sign transaction
    const txBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuf);
    transaction.sign([wallet]);
    
    // Send transaction
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    console.log(`[Executor] Transaction sent: ${signature}`);
    
    // Confirm transaction
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      return { success: false, error: confirmation.value.err, signature };
    }
    
    console.log(`[Executor] Transaction confirmed: ${signature}`);
    return { success: true, signature, quote };
    
  } catch (err) {
    console.error('[Executor] Swap execution error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Buy token with SOL
 */
export async function buyToken(tokenMint, solAmount) {
  const amountLamports = Math.floor(solAmount * 1e9);
  
  // In paper trading mode, skip actual quote fetch
  if (config.paperTrading) {
    console.log(`[Executor] PAPER TRADE - Simulating buy of ${tokenMint} with ${solAmount} SOL`);
    return {
      success: true,
      paper: true,
      quote: {
        inputMint: SOL_MINT,
        outputMint: tokenMint,
        inAmount: amountLamports,
        outAmount: Math.floor(amountLamports * 1000000), // Simulated token amount
      }
    };
  }
  
  console.log(`[Executor] Getting quote to buy ${tokenMint} with ${solAmount} SOL...`);
  const quote = await getQuote(SOL_MINT, tokenMint, amountLamports);
  
  if (!quote) {
    return { success: false, error: 'Failed to get quote' };
  }
  
  console.log(`[Executor] Quote received: ${quote.outAmount} tokens for ${solAmount} SOL`);
  
  return executeSwap(quote);
}

/**
 * Sell token for SOL
 */
export async function sellToken(tokenMint, tokenAmount) {
  console.log(`[Executor] Getting quote to sell ${tokenAmount} of ${tokenMint}...`);
  const quote = await getQuote(tokenMint, SOL_MINT, tokenAmount);
  
  if (!quote) {
    return { success: false, error: 'Failed to get quote' };
  }
  
  console.log(`[Executor] Quote received: ${quote.outAmount / 1e9} SOL for tokens`);
  
  return executeSwap(quote);
}

/**
 * Get token balance
 */
export async function getTokenBalance(tokenMint) {
  const { connection, wallet } = initWallet();
  if (!wallet) return 0;
  
  try {
    const res = await fetch(HELIUS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          wallet.publicKey.toString(),
          { mint: tokenMint },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    
    const data = await res.json();
    const accounts = data.result?.value || [];
    
    if (accounts.length === 0) return 0;
    
    const balance = accounts[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance;
  } catch (err) {
    console.error('[Executor] Token balance error:', err.message);
    return 0;
  }
}

export default { initWallet, getBalance, buyToken, sellToken, getTokenBalance, getQuote };
