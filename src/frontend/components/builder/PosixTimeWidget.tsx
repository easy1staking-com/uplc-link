"use client";

/**
 * Smart widget for POSIXTime parameters: datetime picker filling the integer
 * schema with milliseconds, plus a raw millisecond input with a seconds-vs-
 * milliseconds sanity hint (Cardano POSIXTime is milliseconds).
 */

import type { FormValue } from "@/lib/blueprint/types";

interface PosixTimeWidgetProps {
  value: FormValue;
  onChange: (value: FormValue) => void;
}

function msToLocalInput(text: string): string {
  if (!/^\d+$/.test(text)) return "";
  const ms = Number(text);
  if (!Number.isFinite(ms) || ms <= 0 || ms > 4102444800000) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function PosixTimeWidget({ value, onChange }: PosixTimeWidgetProps) {
  const text = value.kind === "int" ? value.text : "";
  const looksLikeSeconds = /^\d{9,11}$/.test(text.trim());

  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center">
        <input
          type="datetime-local"
          value={msToLocalInput(text)}
          onChange={(e) => {
            if (!e.target.value) return;
            const ms = new Date(e.target.value).getTime();
            if (Number.isFinite(ms)) onChange({ kind: "int", text: String(ms) });
          }}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-zinc-600"
        />
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => onChange({ kind: "int", text: e.target.value })}
          placeholder="POSIX time in milliseconds"
          className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-zinc-600"
        />
      </div>
      <p className="text-xs text-gray-500">
        Cardano POSIXTime is in <span className="font-medium">milliseconds</span>.
        {looksLikeSeconds && (
          <span className="text-orange-400 ml-1">
            This value looks like seconds — did you mean {text.trim()}000?
          </span>
        )}
      </p>
    </div>
  );
}
