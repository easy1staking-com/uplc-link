/**
 * Verification-related type definitions
 * Used by the frontend verification flow
 */

export interface ParameterSchema {
  title?: string;
  schema: any;
}

export interface VerificationResultItem {
  validator: string;
  validatorModule: string;
  validatorName: string;
  purposes: string[];
  hash: string; // Script hash - used as unique key
  parameters?: ParameterSchema[];
  expected: string;
  actual: string;
  matches: boolean | null;
  missing: boolean;
  requiresParams?: boolean;
  parameterized?: boolean;
  compiledCode?: string;
  plutusVersion?: 'V1' | 'V2' | 'V3';
}

export interface VerificationResult {
  success: boolean;
  results: VerificationResultItem[];
  buildLog?: string;
  error?: string;
  warnings?: string[];
}

export interface ParameterValue {
  name: string;
  value: string;
  useValidatorRef: boolean;
  referenceTo?: string; // Which validator hash to reference
}

export interface ValidatorParams {
  [hash: string]: ParameterValue[]; // Keyed by hash instead of name
}

export interface VerificationData {
  repoUrl: string;
  commitHash: string;
  aikenVersion: string;
  sourcePath?: string;
  expectedHashes: string;
  results: VerificationResultItem[];
  validatorParams: ValidatorParams;
  calculatedHashes: Record<string, string>;
}
