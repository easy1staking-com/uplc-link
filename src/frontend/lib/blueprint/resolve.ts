/**
 * $ref resolution for CIP-57 blueprint schemas.
 *
 * Refs look like `#/definitions/cardano~1address~1Address` where the JSON
 * pointer escapes `/` as `~1` and `~` as `~0`. Definition keys in plutus.json
 * are stored unescaped (`cardano/address/Address`).
 */

import type { BlueprintSchema, BlueprintDefinitions } from "./types";

/** Unescape a JSON-pointer segment: ~1 -> /, ~0 -> ~ (order matters). */
export function unescapeJsonPointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Extract the definitions key a $ref points at, or null when the ref does not
 * target `#/definitions/...`.
 */
export function refToDefinitionKey(ref: string): string | null {
  const prefix = "#/definitions/";
  if (!ref.startsWith(prefix)) return null;
  return unescapeJsonPointer(ref.slice(prefix.length));
}

export interface ResolvedSchema {
  schema: BlueprintSchema;
  /** The last definitions key traversed while following $refs (if any). */
  refName?: string;
  /** True when a $ref could not be resolved against the definitions map. */
  dangling: boolean;
}

/**
 * Follow a chain of $refs to a concrete schema node. Cycle-safe: a repeated
 * definition key terminates resolution (the node is reported dangling and the
 * caller renders it as CBOR-paste).
 */
export function resolveSchema(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions
): ResolvedSchema {
  let current = schema;
  let refName: string | undefined;
  const seen = new Set<string>();

  while (current && typeof current.$ref === "string") {
    const key = refToDefinitionKey(current.$ref);
    if (key === null) return { schema: current, refName, dangling: true };
    if (seen.has(key)) return { schema: current, refName, dangling: true };
    seen.add(key);

    // Keys are stored unescaped, but tolerate blueprints that keep the
    // escaped form as the map key.
    const target =
      definitions[key] ?? definitions[current.$ref.slice("#/definitions/".length)];
    if (!target) return { schema: current, refName, dangling: true };

    refName = key;
    current = target;
  }

  return { schema: current ?? {}, refName, dangling: false };
}
