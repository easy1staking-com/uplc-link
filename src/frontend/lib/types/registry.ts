/**
 * Registry-related type definitions
 * These match the backend DTOs
 */

export interface ScriptResponseDto {
  scriptName: string;
  moduleName: string;
  validatorName: string;
  purpose: string;
  rawHash: string;
  finalHash: string | null;
  plutusVersion: string;
  parameterizationStatus: 'NONE_REQUIRED' | 'PARTIAL' | 'COMPLETE';
  requiredParameters: Array<{
    title: string;
    schema: Record<string, any>;
  }> | null;
  providedParameters: string[] | null;
}

export interface ScriptListResponseDto {
  sourceUrl: string;
  commitHash: string;
  sourcePath: string | null;
  compilerType: string;
  compilerVersion: string;
  status: string;
  scripts: ScriptResponseDto[];
}

export interface VerificationResponseDto {
  txHash: string;
  sourceUrl: string;
  commitHash: string;
  sourcePath: string | null;
  compilerType: string;
  compilerVersion: string;
  status: 'PENDING' | 'PROCESSING' | 'VERIFIED' | 'FAILED' | 'INSUFFICIENT_PARAMS';
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  scripts: ScriptResponseDto[];
}

export type VerificationStatus = 'PENDING' | 'PROCESSING' | 'VERIFIED' | 'FAILED' | 'INSUFFICIENT_PARAMS';
export type ParameterizationStatus = 'NONE_REQUIRED' | 'PARTIAL' | 'COMPLETE';

export interface StatsResponseDto {
  verifications: number;
  scripts: number;
  repositories: number;
}
