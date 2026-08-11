/**
 * Schema classification for the blueprint parameter builder.
 *
 * Classifies a (possibly $ref'd) CIP-57 schema node into the small set of
 * shapes the form renderer and encoder understand:
 *
 * - Data-level values: integer / bytes / list / tuple / map / constructor
 * - Raw UPLC constants: `#`-prefixed dataTypes (#bytes, #integer, #string,
 *   #unit, #boolean, #data) applied as constant terms, not as Data
 * - Opaque: `Data` / missing dataType / unresolvable refs / recursion beyond
 *   the depth guard -> CBOR-paste only
 * - Unsupported: raw #pair/#list/#fun constants (no form or CBOR
 *   representation we can apply faithfully)
 *
 * This module absorbs the old heuristics (getParameterType / isByteArrayType /
 * isIntegerType / isComplexType) from app/verify/page.tsx.
 */

import type { BlueprintSchema, BlueprintDefinitions, FormValue } from "./types";
import { resolveSchema } from "./resolve";

/** Recursion guard for cyclic/recursive schema definitions. */
export const MAX_SCHEMA_DEPTH = 24;

export interface ConstructorVariant {
  /** on-chain constructor index (constr tag) */
  index: number;
  title?: string;
  fields: { title?: string; schema: BlueprintSchema }[];
}

export type RawConstantKind =
  | "bytes"
  | "integer"
  | "string"
  | "unit"
  | "boolean"
  | "data";

export type ClassifiedSchema =
  | { kind: "integer"; refName?: string; title?: string }
  | { kind: "bytes"; refName?: string; title?: string }
  | { kind: "list"; items: BlueprintSchema; refName?: string; title?: string }
  | { kind: "tuple"; items: BlueprintSchema[]; refName?: string; title?: string }
  | {
      kind: "map";
      keys: BlueprintSchema;
      values: BlueprintSchema;
      refName?: string;
      title?: string;
    }
  | {
      kind: "constructor";
      variants: ConstructorVariant[];
      refName?: string;
      title?: string;
    }
  | { kind: "raw"; raw: RawConstantKind; refName?: string; title?: string }
  | { kind: "opaque"; reason: string; refName?: string; title?: string }
  | { kind: "unsupported"; reason: string; refName?: string; title?: string };

function toVariant(node: BlueprintSchema): ConstructorVariant | null {
  if (node.dataType !== "constructor") return null;
  if (typeof node.index !== "number") return null;
  const fields = Array.isArray(node.fields) ? node.fields : [];
  return {
    index: node.index,
    title: node.title,
    fields: fields.map((f) => ({ title: f.title, schema: f })),
  };
}

/**
 * Classify a schema node, following $refs first.
 *
 * @param depth - current recursion depth of the caller walking the schema
 *                tree; beyond MAX_SCHEMA_DEPTH the node is opaque (CBOR-paste)
 */
export function classifySchema(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions,
  depth = 0
): ClassifiedSchema {
  if (depth > MAX_SCHEMA_DEPTH) {
    return { kind: "opaque", reason: "Schema exceeds maximum nesting depth" };
  }

  const resolved = resolveSchema(schema, definitions);
  const { refName, dangling } = resolved;
  const node = resolved.schema;
  const title = node.title ?? schema.title;

  if (dangling) {
    return { kind: "opaque", reason: "Unresolvable $ref", refName, title };
  }

  const dataType = node.dataType;

  // Raw UPLC constants (unwrapped parameters): "#bytes", "#integer", ...
  if (typeof dataType === "string" && dataType.startsWith("#")) {
    const raw = dataType.slice(1);
    switch (raw) {
      case "bytes":
      case "integer":
      case "string":
      case "unit":
      case "boolean":
        return { kind: "raw", raw, refName, title };
      case "data":
        // A raw Data constant carries the same payload as a Data-level
        // parameter; only the application differs (still a plain constant).
        return { kind: "raw", raw: "data", refName, title };
      default:
        return {
          kind: "unsupported",
          reason: `Raw constant type "${dataType}" is not supported`,
          refName,
          title,
        };
    }
  }

  if (dataType === "integer") return { kind: "integer", refName, title };
  if (dataType === "bytes") return { kind: "bytes", refName, title };

  if (dataType === "list" || (dataType === undefined && node.items !== undefined)) {
    const items = node.items;
    if (Array.isArray(items)) return { kind: "tuple", items, refName, title };
    if (items && typeof items === "object")
      return { kind: "list", items, refName, title };
    return { kind: "opaque", reason: "List without item schema", refName, title };
  }

  if (
    dataType === "map" ||
    (dataType === undefined && node.keys !== undefined && node.values !== undefined)
  ) {
    if (node.keys && node.values) {
      return { kind: "map", keys: node.keys, values: node.values, refName, title };
    }
    return { kind: "opaque", reason: "Map without key/value schemas", refName, title };
  }

  if (dataType === "constructor") {
    const variant = toVariant(node);
    if (variant) return { kind: "constructor", variants: [variant], refName, title };
    return { kind: "opaque", reason: "Malformed constructor schema", refName, title };
  }

  const union = node.anyOf ?? node.oneOf;
  if (Array.isArray(union) && union.length > 0) {
    const variants: ConstructorVariant[] = [];
    for (const member of union) {
      // Union members may themselves be refs to constructors.
      const memberResolved = resolveSchema(member, definitions);
      const variant = toVariant(memberResolved.schema);
      if (!variant) {
        return {
          kind: "opaque",
          reason: "Union with non-constructor members",
          refName,
          title,
        };
      }
      variants.push(variant);
    }
    return { kind: "constructor", variants, refName, title };
  }

  // `Data` (opaque any) or an empty/unknown schema
  if (title === "Data" || node.description === "Any Plutus data.") {
    return { kind: "opaque", reason: "Opaque Data parameter", refName, title };
  }
  return { kind: "opaque", reason: "Unrecognized schema shape", refName, title };
}

/**
 * Human-readable type label (replacement for the old getParameterType).
 *
 * Depth-guarded, and the fallback label is computed LAZILY: a named ($ref'd)
 * node must never recurse into its items — cyclic definitions like
 * `L = list<L>` would otherwise overflow the stack while rendering.
 */
export function describeSchema(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions,
  depth = 0
): string {
  if (depth > MAX_SCHEMA_DEPTH) return "…";
  const classified = classifySchema(schema, definitions, depth);
  const named = (fallback: () => string) => {
    if (classified.refName) {
      const parts = classified.refName.split("/");
      return parts[parts.length - 1] || fallback();
    }
    return classified.title ?? fallback();
  };
  switch (classified.kind) {
    case "integer":
      return named(() => "Int");
    case "bytes":
      return named(() => "ByteArray");
    case "list":
      return named(
        () => `List<${describeSchema(classified.items, definitions, depth + 1)}>`
      );
    case "tuple":
      return named(
        () =>
          `(${classified.items
            .map((i) => describeSchema(i, definitions, depth + 1))
            .join(", ")})`
      );
    case "map":
      return named(() => "Map");
    case "constructor":
      return named(() =>
        classified.variants.length > 1
          ? "union"
          : classified.variants[0].title ?? "constructor"
      );
    case "raw":
      return `#${classified.raw}`;
    case "opaque":
      return named(() => "Data");
    case "unsupported":
      return named(() => "unsupported");
  }
}

/**
 * Shared node budget for default-value construction. The depth guard alone
 * bounds depth, not breadth: a self-referential product type like
 * `Tree { Node(Tree, Tree), Leaf(Int) }` would build ~2^MAX_SCHEMA_DEPTH
 * nodes. Exhausting the budget degrades the remaining subtree to CBOR-paste.
 */
interface NodeBudget {
  remaining: number;
}

export const EMPTY_FORM_NODE_BUDGET = 4000;

/**
 * Build a sensible default FormValue for a schema (constructor -> first
 * variant with recursive defaults, list/map -> empty, scalars -> empty text).
 * Bounded both by depth and by a total node budget (see NodeBudget).
 */
export function emptyFormValue(
  schema: BlueprintSchema,
  definitions: BlueprintDefinitions,
  depth = 0,
  budget: NodeBudget = { remaining: EMPTY_FORM_NODE_BUDGET }
): FormValue {
  if (budget.remaining <= 0) return { kind: "cbor", hex: "" };
  budget.remaining--;

  const classified = classifySchema(schema, definitions, depth);
  switch (classified.kind) {
    case "integer":
      return { kind: "int", text: "" };
    case "bytes":
      return { kind: "bytes", mode: "hex", text: "" };
    case "list":
      return { kind: "list", items: [] };
    case "tuple":
      return {
        kind: "tuple",
        items: classified.items.map((i) =>
          emptyFormValue(i, definitions, depth + 1, budget)
        ),
      };
    case "map":
      return { kind: "map", entries: [] };
    case "constructor":
      return {
        kind: "constr",
        variant: 0,
        fields: classified.variants[0].fields.map((f) =>
          emptyFormValue(f.schema, definitions, depth + 1, budget)
        ),
      };
    case "raw":
      switch (classified.raw) {
        case "integer":
          return { kind: "int", text: "" };
        case "bytes":
          return { kind: "bytes", mode: "hex", text: "" };
        case "string":
          return { kind: "text", text: "" };
        case "boolean":
          return { kind: "bool", value: false };
        case "unit":
          return { kind: "unit" };
        case "data":
          return { kind: "cbor", hex: "" };
      }
    // fallthrough for exhaustiveness — unreachable
    // eslint-disable-next-line no-fallthrough
    case "opaque":
    case "unsupported":
      return { kind: "cbor", hex: "" };
  }
}
