/**
 * The source inputs a registry submission anchors on chain, and whether the
 * verify form still matches them.
 *
 * The verify page snapshots its /api/verify request when `Verify Contract` is
 * clicked. A label-1984 submission must carry that snapshot (the inputs the
 * shown verification actually ran with), never the form's later contents, and
 * is offered only while the form would post the same request again.
 *
 * Fields compare after the request projection: the version as its canonical
 * tag, env trimmed, repo/commit/path verbatim as posted. Every ambiguous state
 * (no snapshot, any differing field) resolves to no submission.
 */

/** The /api/verify request body; also the source tuple a submission anchors. */
export interface VerifyInputs {
  repoUrl: string;
  commitHash: string;
  aikenVersion: string;
  sourcePath?: string;
  env?: string;
}

/** The verify form's raw values, with the version already resolved to its tag. */
export interface VerifyFormFields {
  repoUrl: string;
  commitHash: string;
  aikenTag: string | null;
  sourcePath: string;
  env: string;
}

export type VerifyInputField = keyof VerifyInputs;

/** Project the form onto the request the page posts to /api/verify. */
export function toVerifyInputs(form: VerifyFormFields): VerifyInputs {
  return {
    repoUrl: form.repoUrl,
    commitHash: form.commitHash,
    aikenVersion: form.aikenTag ?? "",
    sourcePath: form.sourcePath || undefined,
    env: form.env.trim() || undefined,
  };
}

export type RegistrySubmitReadiness =
  | { kind: "unverified" }
  | { kind: "stale"; changed: VerifyInputField[]; notice: string }
  | { kind: "ready"; inputs: VerifyInputs };

// Compared in this order; the labels are the form's visible label texts.
const FIELDS: readonly VerifyInputField[] = ["repoUrl", "commitHash", "aikenVersion", "sourcePath", "env"];
const LABELS: Record<VerifyInputField, string> = {
  repoUrl: "GitHub Repository URL",
  commitHash: "Commit Hash",
  aikenVersion: "Aiken Version",
  sourcePath: "Source Path",
  env: "Environment",
};

/**
 * Whether a registry submission may be offered: only when a verification
 * completed and the current form equals its request. `ready` carries the
 * snapshot itself, which is what the submission anchors.
 */
export function registrySubmitReadiness(
  verified: VerifyInputs | null,
  current: VerifyInputs
): RegistrySubmitReadiness {
  if (verified === null) return { kind: "unverified" };
  const changed = FIELDS.filter((f) => verified[f] !== current[f]);
  if (changed.length === 0) return { kind: "ready", inputs: verified };
  return {
    kind: "stale",
    changed,
    notice:
      `Changed since this verification: ${changed.map((f) => LABELS[f]).join(", ")}` +
      ". Verify again to submit to the registry, or restore the verified values.",
  };
}
