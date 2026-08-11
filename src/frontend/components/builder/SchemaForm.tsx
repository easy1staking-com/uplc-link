"use client";

/**
 * Recursive schema-driven form renderer over CIP-57 blueprint definitions.
 *
 * constructor -> fieldset (variant selector when multiple constructors)
 * list        -> repeatable rows
 * map         -> key/value rows
 * integer     -> BigInt-validated input
 * bytes       -> BytesInput (hex/UTF-8/validator-ref)
 * opaque      -> CBOR paste
 *
 * Well-known stdlib types render as smart widgets that FILL this same
 * schema; a "manual" toggle always falls back to the generic form.
 */

import { useEffect, useState } from "react";
import type { BlueprintSchema, FormValue } from "@/lib/blueprint/types";
import {
  classifySchema,
  emptyFormValue,
  MAX_SCHEMA_DEPTH,
  type ClassifiedSchema,
} from "@/lib/blueprint/schema";
import { matchWellKnown } from "@/lib/blueprint/well-known";
import type { BuilderContext } from "./context";
import { BytesInput } from "./BytesInput";
import { CborInput } from "./CborInput";
import { AddressWidget } from "./AddressWidget";
import { OutputReferenceWidget } from "./OutputReferenceWidget";
import { PosixTimeWidget } from "./PosixTimeWidget";

interface SchemaFormProps {
  schema: BlueprintSchema;
  value: FormValue;
  onChange: (value: FormValue) => void;
  ctx: BuilderContext;
  depth?: number;
}

/** Expected FormValue kind for a classification (shape self-healing). */
function matchesShape(value: FormValue, classified: ClassifiedSchema): boolean {
  switch (classified.kind) {
    case "integer":
      return value.kind === "int";
    case "bytes":
      return value.kind === "bytes";
    case "list":
      return value.kind === "list";
    case "tuple":
      return value.kind === "tuple";
    case "map":
      return value.kind === "map";
    case "constructor":
      return value.kind === "constr";
    case "raw":
      switch (classified.raw) {
        case "integer":
          return value.kind === "int";
        case "bytes":
          return value.kind === "bytes";
        case "string":
          return value.kind === "text";
        case "boolean":
          return value.kind === "bool";
        case "unit":
          return value.kind === "unit";
        case "data":
          return value.kind === "cbor";
      }
      return false;
    case "opaque":
    case "unsupported":
      return value.kind === "cbor";
  }
}

function IntegerInput({
  value,
  onChange,
}: {
  value: Extract<FormValue, { kind: "int" }>;
  onChange: (v: FormValue) => void;
}) {
  const invalid = value.text.trim() !== "" && !/^-?\d+$/.test(value.text.trim());
  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        value={value.text}
        onChange={(e) => onChange({ kind: "int", text: e.target.value })}
        placeholder="Whole number (e.g. 42)"
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
      />
      {invalid && (
        <p className="text-xs text-red-400 mt-0.5">
          Enter a whole number (arbitrary precision)
        </p>
      )}
    </div>
  );
}

export function SchemaForm({ schema, value, onChange, ctx, depth = 0 }: SchemaFormProps) {
  const [manual, setManual] = useState(false);
  const classified = classifySchema(schema, ctx.definitions, depth);

  // Self-heal when the stored value does not match the schema shape.
  const needsHeal = !matchesShape(value, classified);
  const v = needsHeal ? emptyFormValue(schema, ctx.definitions, depth) : value;

  // Propagate the healed value to the parent (in an effect, not during
  // render) so the encoder never keeps working off the stale mismatched one.
  useEffect(() => {
    if (needsHeal) {
      onChange(emptyFormValue(schema, ctx.definitions, depth));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsHeal]);

  if (depth > MAX_SCHEMA_DEPTH) {
    return (
      <CborInput
        hex={v.kind === "cbor" ? v.hex : ""}
        onChange={(hex) => onChange({ kind: "cbor", hex })}
      />
    );
  }

  // Smart widgets (with manual fallback)
  const wellKnown = matchWellKnown(schema, ctx.definitions);
  if (wellKnown && wellKnown.widget !== "hash-bytes" && !manual) {
    let widget: React.ReactNode = null;
    if (wellKnown.widget === "address") {
      widget = <AddressWidget schema={schema} value={v} onChange={onChange} ctx={ctx} />;
    } else if (wellKnown.widget === "output-reference") {
      widget = (
        <OutputReferenceWidget
          value={v}
          onChange={onChange}
          txIdNested={wellKnown.txIdNested}
        />
      );
    } else if (wellKnown.widget === "posix-time") {
      widget = <PosixTimeWidget value={v} onChange={onChange} />;
    }
    if (widget) {
      return (
        <div className="space-y-1">
          {widget}
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-xs text-gray-500 underline hover:text-gray-300"
          >
            edit fields manually
          </button>
        </div>
      );
    }
  }

  const manualToggle =
    wellKnown && wellKnown.widget !== "hash-bytes" && manual ? (
      <button
        type="button"
        onClick={() => setManual(false)}
        className="text-xs text-gray-500 underline hover:text-gray-300"
      >
        back to smart widget
      </button>
    ) : null;

  switch (classified.kind) {
    case "integer": {
      if (v.kind !== "int") return null;
      return (
        <div className="space-y-1">
          <IntegerInput value={v} onChange={onChange} />
          {manualToggle}
        </div>
      );
    }

    case "bytes": {
      if (v.kind !== "bytes") return null;
      const hint = wellKnown?.widget === "hash-bytes" ? wellKnown : undefined;
      return (
        <BytesInput
          value={v}
          onChange={onChange}
          ctx={ctx}
          expectedBytes={hint?.expectedBytes}
          hintLabel={hint?.label}
        />
      );
    }

    case "list": {
      if (v.kind !== "list") return null;
      return (
        <div className="space-y-2">
          {v.items.map((item, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex-1">
                <SchemaForm
                  schema={classified.items}
                  value={item}
                  onChange={(next) =>
                    onChange({
                      kind: "list",
                      items: v.items.map((it, j) => (j === i ? next : it)),
                    })
                  }
                  ctx={ctx}
                  depth={depth + 1}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange({ kind: "list", items: v.items.filter((_, j) => j !== i) })
                }
                className="px-2 py-1 text-xs bg-zinc-800 hover:bg-red-900 border border-zinc-700 rounded"
                title="Remove item"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                kind: "list",
                items: [
                  ...v.items,
                  emptyFormValue(classified.items, ctx.definitions, depth + 1),
                ],
              })
            }
            className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded"
          >
            + Add item
          </button>
        </div>
      );
    }

    case "tuple": {
      if (v.kind !== "tuple") return null;
      return (
        <div className="space-y-2">
          {classified.items.map((itemSchema, i) => (
            <div key={i}>
              <label className="block text-xs text-gray-400 mb-1">Element {i + 1}</label>
              <SchemaForm
                schema={itemSchema}
                value={v.items[i]}
                onChange={(next) =>
                  onChange({
                    kind: "tuple",
                    items: v.items.map((it, j) => (j === i ? next : it)),
                  })
                }
                ctx={ctx}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      );
    }

    case "map": {
      if (v.kind !== "map") return null;
      return (
        <div className="space-y-2">
          {v.entries.map((entry, i) => (
            <div
              key={i}
              className="flex gap-2 items-start border border-zinc-800 rounded p-2"
            >
              <div className="flex-1 space-y-1">
                <label className="block text-xs text-gray-400">Key</label>
                <SchemaForm
                  schema={classified.keys}
                  value={entry.key}
                  onChange={(next) =>
                    onChange({
                      kind: "map",
                      entries: v.entries.map((en, j) =>
                        j === i ? { ...en, key: next } : en
                      ),
                    })
                  }
                  ctx={ctx}
                  depth={depth + 1}
                />
                <label className="block text-xs text-gray-400">Value</label>
                <SchemaForm
                  schema={classified.values}
                  value={entry.value}
                  onChange={(next) =>
                    onChange({
                      kind: "map",
                      entries: v.entries.map((en, j) =>
                        j === i ? { ...en, value: next } : en
                      ),
                    })
                  }
                  ctx={ctx}
                  depth={depth + 1}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange({ kind: "map", entries: v.entries.filter((_, j) => j !== i) })
                }
                className="px-2 py-1 text-xs bg-zinc-800 hover:bg-red-900 border border-zinc-700 rounded"
                title="Remove entry"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                kind: "map",
                entries: [
                  ...v.entries,
                  {
                    key: emptyFormValue(classified.keys, ctx.definitions, depth + 1),
                    value: emptyFormValue(classified.values, ctx.definitions, depth + 1),
                  },
                ],
              })
            }
            className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded"
          >
            + Add entry
          </button>
        </div>
      );
    }

    case "constructor": {
      if (v.kind !== "constr") return null;
      const variant = classified.variants[v.variant] ?? classified.variants[0];
      const variantPos = classified.variants.indexOf(variant);
      return (
        <div className="space-y-2">
          {manualToggle}
          {classified.variants.length > 1 && (
            <select
              value={variantPos}
              onChange={(e) => {
                const next = Number(e.target.value);
                onChange({
                  kind: "constr",
                  variant: next,
                  fields: classified.variants[next].fields.map((f) =>
                    emptyFormValue(f.schema, ctx.definitions, depth + 1)
                  ),
                });
              }}
              className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-zinc-600"
            >
              {classified.variants.map((variantDef, i) => (
                <option key={i} value={i}>
                  {variantDef.title ?? `Constructor ${variantDef.index}`}
                </option>
              ))}
            </select>
          )}
          {variant.fields.length > 0 && (
            <fieldset
              className={
                depth > 0 ? "border-l-2 border-zinc-800 pl-3 space-y-2" : "space-y-2"
              }
            >
              {variant.fields.map((field, i) => (
                <div key={`${variantPos}-${i}`}>
                  <label className="block text-xs text-gray-400 mb-1">
                    {field.title ?? `Field ${i + 1}`}
                  </label>
                  <SchemaForm
                    schema={field.schema}
                    value={v.fields[i] ?? emptyFormValue(field.schema, ctx.definitions, depth + 1)}
                    onChange={(next) =>
                      onChange({
                        kind: "constr",
                        variant: variantPos,
                        fields: variant.fields.map(
                          (f, j) =>
                            (j === i ? next : v.fields[j]) ??
                            emptyFormValue(f.schema, ctx.definitions, depth + 1)
                        ),
                      })
                    }
                    ctx={ctx}
                    depth={depth + 1}
                  />
                </div>
              ))}
            </fieldset>
          )}
        </div>
      );
    }

    case "raw": {
      switch (classified.raw) {
        case "integer":
          return v.kind === "int" ? <IntegerInput value={v} onChange={onChange} /> : null;
        case "bytes":
          return v.kind === "bytes" ? (
            <BytesInput value={v} onChange={onChange} ctx={ctx} />
          ) : null;
        case "string":
          return v.kind === "text" ? (
            <input
              type="text"
              value={v.text}
              onChange={(e) => onChange({ kind: "text", text: e.target.value })}
              placeholder="Text (raw UPLC string constant)"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-zinc-600"
            />
          ) : null;
        case "boolean":
          return v.kind === "bool" ? (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={v.value}
                onChange={(e) => onChange({ kind: "bool", value: e.target.checked })}
              />
              {v.value ? "True" : "False"}
            </label>
          ) : null;
        case "unit":
          return <p className="text-xs text-gray-500">Unit (no value needed)</p>;
        case "data":
          return v.kind === "cbor" ? (
            <CborInput hex={v.hex} onChange={(hex) => onChange({ kind: "cbor", hex })} />
          ) : null;
      }
      return null;
    }

    case "opaque": {
      if (v.kind !== "cbor") return null;
      return (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">
            {classified.reason} — provide the value as CBOR hex.
          </p>
          <CborInput hex={v.hex} onChange={(hex) => onChange({ kind: "cbor", hex })} />
        </div>
      );
    }

    case "unsupported":
      return (
        <p className="text-xs text-orange-400">
          {classified.reason}. This parameter cannot be built with the form.
        </p>
      );
  }
}
