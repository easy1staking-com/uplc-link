/**
 * Backend API client
 * Handles communication with the Java backend through Next.js API routes
 */

import { config } from '../config';
import type { ScriptListResponseDto, VerificationResponseDto } from '../types/registry';

export class BackendClient {
  private baseUrl = config.backendUrl;

  /**
   * Get scripts by exact source URL and commit hash
   */
  async getScriptsBySource(sourceUrl: string, commit: string): Promise<ScriptListResponseDto> {
    const params = new URLSearchParams({ sourceUrl, commit });
    const response = await fetch(`/api/registry?action=bySource&${params}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get scripts by script hash (raw or final)
   */
  async getScriptsByHash(hash: string): Promise<ScriptListResponseDto> {
    const response = await fetch(`/api/registry?action=byHash&hash=${hash}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get verification status for source URL and commit
   */
  async getVerificationStatus(sourceUrl: string, commit: string): Promise<VerificationResponseDto> {
    const params = new URLSearchParams({ sourceUrl, commit });
    const response = await fetch(`/api/registry?action=status&${params}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search scripts by partial source URL pattern
   * @param urlPattern - Pattern to search (e.g., "sundae-labs", "easy1staking", "aiken-lang")
   */
  async searchByUrlPattern(urlPattern: string): Promise<ScriptListResponseDto[]> {
    const response = await fetch(`/api/registry?action=search&urlPattern=${encodeURIComponent(urlPattern)}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get verification request by transaction hash (for deep linking)
   * @param txHash - Transaction hash that submitted the verification request
   */
  async getVerificationByTxHash(txHash: string): Promise<VerificationResponseDto> {
    const response = await fetch(`/api/registry?action=byTxHash&txHash=${txHash}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// Export singleton instance
export const backendClient = new BackendClient();
