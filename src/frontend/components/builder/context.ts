/**
 * Shared context passed down the builder component tree.
 */

import type { BlueprintDefinitions } from "@/lib/blueprint/types";

export interface BuilderValidatorRef {
  /** raw (unapplied) script hash — the stable key used across the verify page */
  hash: string;
  /** display name, e.g. "module.validator" */
  name: string;
  /** current (possibly parameterized) hash for display */
  currentHash: string;
}

export interface BuilderContext {
  definitions: BlueprintDefinitions;
  /** validators available for "use validator hash reference" on bytes fields */
  validators: BuilderValidatorRef[];
}
