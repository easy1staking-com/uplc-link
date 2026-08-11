/**
 * Verification-related type definitions
 * Used by the frontend verification flow
 */

import type {
  BlueprintDefinitions,
  BlueprintPreamble,
  BlueprintSchema,
  ParameterState,
} from "@/lib/blueprint/types";

export interface ParameterSchema {
  title?: string;
  schema: BlueprintSchema;
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
  /** CIP-57 blueprint definitions map (drives the parameter builder) */
  definitions?: BlueprintDefinitions;
  preamble?: BlueprintPreamble;
  buildLog?: string;
  error?: string;
  warnings?: string[];
}

/** Builder state for all parameterized validators, keyed by raw script hash. */
export interface ValidatorParams {
  [hash: string]: ParameterState[];
}

export interface VerificationData {
  repoUrl: string;
  commitHash: string;
  aikenVersion: string;
  sourcePath?: string;
  env?: string; // aiken --env module; empty/absent = built without the flag
  expectedHashes: string;
  results: VerificationResultItem[];
  /**
   * Fully-encoded parameter CBOR hex per validator (raw hash -> params in
   * order), with validator-hash references already resolved. This is what
   * goes into the registry metadata.
   */
  encodedParams: Record<string, string[]>;
  calculatedHashes: Record<string, string>;
}
