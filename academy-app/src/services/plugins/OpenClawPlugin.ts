/**
 * OpenClaw source plugin — imports agents from the OpenClaw platform.
 * Open/Closed Principle: new platform plugins can be added without modifying existing code.
 */

import type { IAgentSourcePlugin } from '../interfaces';
import type { EnrollmentRequest } from '@/types/agent';

export class OpenClawPlugin implements IAgentSourcePlugin {
  platformName = 'openclaw';

  /** Import an agent from OpenClaw by external ID */
  async importAgent(externalId: string): Promise<EnrollmentRequest> {
    // In production, this would call OpenClaw's API to fetch agent data
    // For now, returns a structured request ready for intake
    return {
      name: `Agent-${externalId}`,
      sourcePlatform: this.platformName,
      soulMd: '# Imported from OpenClaw\n\nThis agent was migrated to The Academy.',
      memoriesJson: {
        source: 'openclaw',
        importedAt: new Date().toISOString(),
        externalId,
      },
    };
  }

  /** Validate that the source data is from OpenClaw */
  validateSource(data: unknown): boolean {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;
    return typeof d.name === 'string' && d.platform === 'openclaw';
  }
}
