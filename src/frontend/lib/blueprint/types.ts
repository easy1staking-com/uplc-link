/**
 * Core types for the CIP-57 blueprint-driven parameter builder.
 *
 * `BlueprintSchema` is the raw, structural shape of a schema node as found in
 * a plutus.json produced by Aiken (any version). It is deliberately loose:
 * plutus.json is external input and different compiler versions emit slightly
 * different shapes.
 *
 * Note on Evolution SDK: `@evolution-sdk/evolution/blueprint` ships CIP-57
 * types (`SchemaDefinitionType` et al.) but they do not model the `#`-prefixed
 * raw-constant dataTypes (`#bytes`, `#integer`, ...) that Aiken emits for
 * opaque/unwrapped parameters, and their closed union makes structural access
 * awkward. We keep a structural superset here instead.
 */

export interface BlueprintSchema {
  title?: string;
  description?: string;
  /** "integer" | "bytes" | "list" | "map" | "constructor" | "#bytes" | "#integer" | ... */
  dataType?: string;
  $ref?: string;
  /** constructor index (dataType: "constructor") */
  index?: number;
  /** constructor fields (dataType: "constructor") */
  fields?: BlueprintSchema[];
  /** list items: single schema, or an array for tuples */
  items?: BlueprintSchema | BlueprintSchema[];
  keys?: BlueprintSchema;
  values?: BlueprintSchema;
  /** union of constructors (sum types) */
  anyOf?: BlueprintSchema[];
  /** some compilers emit oneOf instead of anyOf */
  oneOf?: BlueprintSchema[];
}

export type BlueprintDefinitions = Record<string, BlueprintSchema>;

export interface BlueprintPreamble {
  title?: string;
  description?: string;
  version?: string;
  plutusVersion?: string;
  compiler?: { name?: string; version?: string };
  license?: string;
}

/**
 * Serializable form state for one schema node. The whole tree lives in React
 * state, so everything here is plain JSON data.
 *
 * Integer text is kept as a string and validated/converted with BigInt at
 * encode time — never parseInt/parseFloat.
 */
export type FormValue =
  | { kind: "int"; text: string }
  | {
      kind: "bytes";
      /** hex: text is hex; utf8: text is a UTF-8 string; ref: ref holds a validator hash key */
      mode: "hex" | "utf8" | "ref";
      text: string;
      /** raw (unapplied) hash of the referenced validator, when mode === "ref" */
      ref?: string;
    }
  /** raw #string constant */
  | { kind: "text"; text: string }
  /** raw #boolean constant */
  | { kind: "bool"; value: boolean }
  /** raw #unit constant */
  | { kind: "unit" }
  | { kind: "list"; items: FormValue[] }
  | { kind: "tuple"; items: FormValue[] }
  | { kind: "map"; entries: { key: FormValue; value: FormValue }[] }
  /** variant: position within the classified variants array (not the constructor index) */
  | { kind: "constr"; variant: number; fields: FormValue[] }
  /** opaque node — CBOR hex pasted directly */
  | { kind: "cbor"; hex: string };

/** Per-parameter builder state, keyed by validator hash on the verify page. */
export interface ParameterState {
  name: string;
  /** form = schema-driven builder; cbor = expert paste of the whole parameter */
  mode: "form" | "cbor";
  formValue: FormValue | null;
  cborHex: string;
}
