/**
 * MoltCops Defense Matrix - Trust Sync Protocol
 * Client-side protocol for syncing trust data with coordination server
 * 
 * Inspired by Tailscale's controlclient sync
 * BSD-3-Clause License (Tailscale-derived)
 */

import {
  AgentIdentity,
  TrustPolicy,
  TrustMapResponse,
  ScanResult,
  VouchRequest,
} from './types';
import { PolicyEngine } from './policy-engine';

/**
 * Configuration for trust sync client
 */
export interface TrustSyncConfig {
  coordinationServerUrl: string;
  agentId: string;
  privateKey: string;
  publicKey: string;
  syncIntervalMs?: number;
  retryIntervalMs?: number;
  maxRetries?: number;
}

/**
 * Trust sync client that runs on each agent
 */
export class TrustSyncClient {
  private config: TrustSyncConfig;
  private policyEngine: PolicyEngine | null = null;
  private lastMapResponse: TrustMapResponse | null = null;
  private lastVersion: number = 0;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isConnected: boolean = false;
  private retryCount: number = 0;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(config: TrustSyncConfig) {
    this.config = {
      syncIntervalMs: 300000, // 5 minutes
      retryIntervalMs: 30000, // 30 seconds
      maxRetries: 10,
      ...config,
    };
  }

  /**
   * Start the sync client
   */
  async start(): Promise<boolean> {
    try {
      // Initial sync
      const success = await this.sync();
      if (!success) {
        console.error('Initial sync failed');
        return false;
      }

      // Start periodic sync
      this.syncTimer = setInterval(
        () => this.sync(),
        this.config.syncIntervalMs!
      );

      this.isConnected = true;
      this.emit('connected', null);
      return true;
    } catch (error) {
      console.error('Failed to start trust sync:', error);
      return false;
    }
  }

  /**
   * Stop the sync client
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.isConnected = false;
    this.emit('disconnected', null);
  }

  /**
   * Sync with coordination server
   */
  async sync(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.coordinationServerUrl}/api/matrix/map/${this.config.agentId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${await this.createAuthToken()}`,
            'Content-Type': 'application/json',
            'X-Agent-Id': this.config.agentId,
            'X-Last-Version': this.lastVersion.toString(),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`);
      }

      const mapResponse: TrustMapResponse = await response.json();

      // Only process if version changed
      if (mapResponse.version > this.lastVersion) {
        this.lastMapResponse = mapResponse;
        this.lastVersion = mapResponse.version;

        // Update policy engine
        if (!this.policyEngine) {
          this.policyEngine = new PolicyEngine(mapResponse.policy);
        } else {
          this.policyEngine.updatePolicy(mapResponse.policy);
        }

        this.emit('policyUpdated', mapResponse.policy);
        this.emit('agentsUpdated', mapResponse.agents);
      }

      // Send heartbeat
      await this.sendHeartbeat();

      this.retryCount = 0;
      return true;
    } catch (error) {
      console.error('Sync error:', error);
      this.retryCount++;

      if (this.retryCount >= this.config.maxRetries!) {
        this.emit('syncFailed', error);
        return false;
      }

      // Retry with backoff
      setTimeout(
        () => this.sync(),
        this.config.retryIntervalMs! * Math.pow(2, this.retryCount - 1)
      );

      return false;
    }
  }

  /**
   * Send heartbeat to coordination server
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      await fetch(
        `${this.config.coordinationServerUrl}/api/matrix/heartbeat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await this.createAuthToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentId: this.config.agentId,
            endpoints: this.getLocalEndpoints(),
          }),
        }
      );
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }

  /**
   * Submit scan result to coordination server
   */
  async submitScan(scan: ScanResult): Promise<{
    success: boolean;
    newTier?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `${this.config.coordinationServerUrl}/api/matrix/scan`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await this.createAuthToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentId: this.config.agentId,
            scan,
          }),
        }
      );

      const result = await response.json();
      
      if (result.success) {
        this.emit('tierUpdated', result.newTier);
      }

      return result;
    } catch (error) {
      console.error('Submit scan failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Vouch for another agent
   */
  async vouch(request: VouchRequest): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `${this.config.coordinationServerUrl}/api/matrix/vouch`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${await this.createAuthToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fromAgentId: this.config.agentId,
            request,
          }),
        }
      );

      return await response.json();
    } catch (error) {
      console.error('Vouch failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Check if we can access a resource
   */
  canAccess(resource: string): {
    allowed: boolean;
    reason: string;
    pricingMultiplier: number;
  } {
    if (!this.policyEngine || !this.lastMapResponse) {
      return {
        allowed: false,
        reason: 'Not synced with coordination server',
        pricingMultiplier: 1,
      };
    }

    const decision = this.policyEngine.evaluate(
      this.lastMapResponse.self,
      resource
    );

    return {
      allowed: decision.allowed,
      reason: decision.reason,
      pricingMultiplier: decision.pricingMultiplier,
    };
  }

  /**
   * Get current trust tier
   */
  getTier(): string {
    return this.lastMapResponse?.self.tier || 'UNKNOWN';
  }

  /**
   * Get current trust score
   */
  getTrustScore(): number {
    return this.lastMapResponse?.self.trustScore || 0;
  }

  /**
   * Get known agents
   */
  getKnownAgents(): AgentIdentity[] {
    return this.lastMapResponse?.agents || [];
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentIdentity | undefined {
    return this.lastMapResponse?.agents.find(a => a.id === agentId);
  }

  /**
   * Create authentication token
   */
  private async createAuthToken(): Promise<string> {
    // In production, sign a timestamp with private key
    const timestamp = Date.now();
    const message = `${this.config.agentId}:${timestamp}`;
    
    // For now, return a simple token (replace with actual signing)
    return Buffer.from(message).toString('base64');
  }

  /**
   * Get local network endpoints
   */
  private getLocalEndpoints(): string[] {
    // In production, discover local IPs and ports
    return [];
  }

  /**
   * Event handling
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }
}

/**
 * Create and start a trust sync client
 */
export async function createTrustSyncClient(
  config: TrustSyncConfig
): Promise<TrustSyncClient> {
  const client = new TrustSyncClient(config);
  await client.start();
  return client;
}

/**
 * React hook for trust sync (if using React)
 */
export function useTrustSync(config: TrustSyncConfig) {
  // Would implement React hook here
  // Returns { tier, trustScore, canAccess, vouch, sync }
}
