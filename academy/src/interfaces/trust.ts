// ITrustScanner — abstraction over MoltCops
// ITrustService — score management, decay, tiers

export interface ScanResult {
  passed: boolean;
  score: number;
  tier: string;
  findings: { rule: string; severity: string; message: string }[];
  scannedAt: Date;
}

export interface ITrustScanner {
  scan(soulMd: string, skills?: string[]): Promise<ScanResult>;
}

export interface TrustSnapshot {
  agentId: string;
  score: number;
  tier: string;
  lastScanAt: Date;
  scansPassed: number;
  scansFailed: number;
  consecutiveClean: number;
}

export interface ITrustService {
  initFromScan(agentId: string, scanResult: ScanResult): Promise<TrustSnapshot>;
  getScore(agentId: string): Promise<TrustSnapshot | null>;
  getHistory(agentId: string, limit?: number): Promise<any[]>;
  processDecay(agentId: string): Promise<void>;
  processDecayAll(): Promise<{ processed: number; decayed: number }>;
}

// Tier thresholds — simple function, no strategy pattern needed yet
export function calculateTier(score: number): string {
  if (score >= 90) return 'legendary';
  if (score >= 70) return 'elite';
  if (score >= 50) return 'rising';
  if (score >= 30) return 'unstable';
  return 'quarantined';
}
