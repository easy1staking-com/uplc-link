# CIP-0171 amendment draft — Aiken `env` field (constructor 0, six-field layout)

Prepared alongside the uplc-link `env` implementation. Target: follow-up PR to
cardano-foundation/CIPs amending CIP-0171 (merged as `Proposed` via PR #1136).

This document is the **source of truth for the amendment text**. Every section
below is full replacement text for a section of `CIP-0171/README.md`, so the
amendment can be applied to a fork checkout mechanically, without re-deciding
anything.

## Process summary

- **PR title:** `CIP-0171 | Add env field to the Aiken schema`.
- **Sequencing.** The upstream PR is **not** opened when this draft is
  finished. It is opened only after: the implementation is deployed, the
  existing mainnet records are replayed on-chain in the new format, and
  Giovanni gives an explicit go. Nothing in this repository opens, comments on,
  or pushes to any GitHub repository.
- **Why the sequencing matters for the wording.** The drafted CIP text below
  asserts in the **past tense** that the existing records have been re-published
  in the new format. That assertion is only true after the replay, which is why
  the document is finalized after the replay is complete on-chain and not
  before. The text is written as it will read on the day the PR opens.
- Amending a merged CIP is **just a follow-up PR** — same editor flow
  (biweekly triage, review, merge). PRs that rework an existing proposal get the
  `Update` label and are introduced at a CIP meeting. (CIP-0001 "Process".)
- **`Proposed` status permits substantial edits** — only `Active` CIPs are
  frozen.
- No manual changelog needed: CIP text changelogs are auto-generated from git
  history (CIP-0001 "Versioning").
- **Point to defend at the editor meeting:** CIP-0171's own versioning rule says
  field-layout changes get a *new constructor ID*. Redefining constructor 0 in
  place is a one-time exception — argued in the Versioning note below, and
  pre-answered in the PR body at the end of this document.

## Scope of the amendment

The amendment is **Aiken-only**:

- Constructor 0 (Aiken) gains an `env` field and becomes a fixed six-element
  list.
- Constructors 1–5 (Plutarch, PlutusTx, Scalus, plu-ts, OpShin) are **not
  touched**: same five-field layout, same optionality, same CDDL production as
  published. They carry no `env` field at all.
- One shared production is corrected as an erratum: `parameter_list` becomes
  `[ * bytes ]`. See the CDDL section for why.

## Sections to change in `CIP-0171/README.md`

1. **Preamble `Discussions`** — gains `- Amendment PR: <url-pending>`. The URL
   is filled in when the upstream PR is opened; CIP-0001 requires the
   `Discussions` list to link the PRs that modify the CIP.
2. **`## Abstract`** — one-line mention of the build environment, for Aiken.
3. **`### Compiler and Schema Versioning`** — versioning table row for Aiken,
   plus the new versioning note.
4. **`### Field Layout`** — split into two tables: the Aiken (constructor 0)
   six-field table, and the unchanged five-field table for constructors 1–5.
5. **New `#### Env` subsection**, placed after `#### Compiler Version`.
6. **`#### Parameters`** — the `Structure` line reflects the wire shape
   actually used: each parameter is a bytestring wrapping the CBOR encoding of
   that parameter.
7. **`### CDDL Schema`** — `verification_data` splits `aiken_fields` from
   `compiler_fields`; `parameter_list` erratum.
8. **`### Verification Process`** step 5 — compile with the recorded build
   environment.
9. **`## Rationale`** — two additions: residual reproducibility limits, and the
   compatibility argument from the deployed record corpus.

---

# Drafted replacement text

## 1. Preamble `Discussions`

```yaml
Discussions:
    - Forum Discussion: https://forum.cardano.org/t/cip-idea-smart-contract-source-code-verification-metadata/152403
    - Original PR: https://github.com/cardano-foundation/CIPs/pull/1136
    - Amendment PR: <url-pending>
```

The `<url-pending>` placeholder is replaced with the amendment PR's URL once it
is opened. No other preamble field changes: `Status` stays `Proposed`, and the
`Created` date is not touched (CIP-0001 auto-generates the change history from
git).

## 2. `## Abstract` — first paragraph

Replaces the first paragraph of `## Abstract`:

```markdown
This CIP defines a decentralized, on-chain metadata standard for linking Cardano script hashes to their published source code. Using transaction metadata label `1984`, anyone can publish records containing the source repository URL, git commit hash, compiler type and version, the build environment used to compile the script (for Aiken), and script parameters. Verifiers can then independently compile the source and confirm that the resulting script hash matches an on-chain script, establishing a verified link between the deployed script and its source code origin.
```

The remaining paragraphs of the Abstract are unchanged.

## 3. `### Compiler and Schema Versioning`

Replaces the versioning table and the two paragraphs that follow it:

```markdown
| Constructor ID | Compiler | Schema Version | Language |
|----------------|----------|----------------|----------|
| 0 | Aiken | 2 | Aiken |
| 1 | Plutarch | 1 | Haskell |
| 2 | PlutusTx | 1 | Haskell |
| 3 | Scalus | 1 | Scala |
| 4 | plu-ts | 1 | TypeScript |
| 5 | OpShin | 1 | Python |

This design allows each compiler's metadata schema to evolve independently. If a compiler requires changes to its field layout (adding, removing, or reordering fields), a new constructor ID is assigned for the updated schema version. Implementations encountering an unrecognized constructor SHOULD ignore the record rather than fail.

New compilers or schema versions may be added by submitting a pull request to this CIP. Constructor IDs are assigned sequentially and MUST NOT be reused or reassigned.

#### Versioning note: in-place revision of the Aiken schema

Constructor 0 carries schema version 2 while keeping constructor ID 0. This
departs from the two rules stated immediately above:

> If a compiler requires changes to its field layout (adding, removing, or
> reordering fields), a new constructor ID is assigned for the updated schema
> version.

> Constructor IDs are assigned sequentially and MUST NOT be reused or
> reassigned.

Both rules remain in force. This revision is a **one-time exception**, narrowed
to constructor 0 and to this revision only, granted on three grounds:

1. **Status.** This CIP is `Proposed`, not `Active`. Proposed standards are
   explicitly revisable.
2. **Single implementation.** Constructor 0 has one known implementation, and
   it is the reference implementation named in the Implementation Plan.
3. **The prior records were replaced, not stranded.** Every record that existed
   on mainnet under the previous Aiken layout has been re-published by its
   author in the revised layout. No consumer is left holding a record that this
   document no longer describes.

Consumers MUST parse constructor 0 as a fixed six-element list per this
document. Records under any constructor that do not decode to that
constructor's field layout — wrong element count, wrong element types, or CBOR
that does not decode at all — MUST be ignored rather than treated as an error;
metadata label 1984 is shared with unrelated payloads and non-conforming data
under the label is expected, not exceptional.

Any future change to any compiler's field layout, constructor 0 included, MUST
use the standard mechanism and be assigned a new constructor ID. This exception
is not a precedent and is not available again.
```

## 4. `### Field Layout`

Replaces the intro sentence and the single table under `### Field Layout`:

```markdown
Field layout is per-constructor. Aiken (constructor 0, schema version 2) uses a
fixed six-element list; the remaining compilers use the five-field layout below.

#### Constructor 0 (Aiken)

The constructor's fields form a fixed six-element list. All fields are always
present; optionality is expressed through empty values rather than omission.

| Index | Field | Type | Description |
|-------|-------|------|-------------|
| 0 | sourceUrl | Bytes (UTF-8) | Git-compatible repository URL |
| 1 | commitHash | Bytes | Git commit hash (20 bytes for SHA-1, 32 bytes for SHA-256) |
| 2 | sourcePath | Bytes (UTF-8) | Path to the project directory within the repository; empty bytes = repository root |
| 3 | compilerVersion | Bytes (UTF-8) | Exact compiler version string (e.g., "v1.1.3") |
| 4 | env | Bytes (UTF-8) | Build environment identifier; for Aiken, the module name passed to `aiken build --env`. Empty bytes = built without an environment flag |
| 5 | parameters | Map | Script hash to parameter data mappings; may be empty |

#### Constructors 1–5 (Plutarch, PlutusTx, Scalus, plu-ts, OpShin)

The constructor's fields contain the following data in order:

| Index | Field | Type | Required | Description |
|-------|-------|------|----------|-------------|
| 0 | sourceUrl | Bytes (UTF-8) | Yes | Git-compatible repository URL |
| 1 | commitHash | Bytes | Yes | Git commit hash (20 bytes for SHA-1, 32 bytes for SHA-256) |
| 2 | sourcePath | Bytes (UTF-8) | No | Path to source file within repository (empty if root) |
| 3 | compilerVersion | Bytes (UTF-8) | Yes | Exact compiler version string (e.g., "v1.1.3") |
| 4 | parameters | Map | No | Script hash to parameter data mappings |

These layouts are unchanged by this revision.
```

## 5. New `#### Env` subsection

Inserted after `#### Compiler Version`:

```markdown
#### Env

The `env` field applies to constructor 0 (Aiken) only. It records the build
environment used to compile the script: the environment module name passed via
`aiken build --env <name>`.

Empty bytes indicate the build was invoked **without** the `--env` flag. This
is not shorthand for `--env default`: a build that explicitly uses the default
environment module MUST record `default`. Verifiers reproduce the build by
invoking the compiler with `--env <env>` when the field is non-empty, and with
no environment flag when it is empty. A verifier that rebuilds an empty-`env`
record with no environment flag and obtains a different script hash has a
**failed verification claim**, not a record with a missing field: it MUST NOT
retry with a guessed environment, and MUST report the record as unverified.

A non-empty value MUST match, in full, `[a-z][a-z0-9_]*` — treat the expression
as anchored at both ends, so the whole value must be consumed by it — and MUST NOT
exceed 64 bytes.
```

## 6. `#### Parameters` — `Structure` block

Replaces the `Structure` block and the `Where:` list under `#### Parameters`.
The prose above them (the paragraph explaining parameterized scripts) is
unchanged.

````markdown
Structure:
```
Map<ScriptHash, List<Bytes>>
```

Where:
- `ScriptHash` is the 28-byte Blake2b-224 hash of the compiled script
- `List<Bytes>` contains the parameters applied to produce that specific script, in application order; each list element is a bytestring wrapping the CBOR encoding of one parameter
````

## 7. `### CDDL Schema`

### 7a. Replacement block

Replaces the contiguous span from `verification_data = …` through
`parameter_list = …` in the published schema. Everything above
`verification_data` is unchanged.

```cddl
verification_data = #6.121([aiken_fields])     ; Constructor 0 = Aiken, schema v2
                  / #6.122([compiler_fields])  ; Constructor 1 = Plutarch, schema v1
                  / #6.123([compiler_fields])  ; Constructor 2 = PlutusTx, schema v1
                  / #6.124([compiler_fields])  ; Constructor 3 = Scalus, schema v1
                  / #6.125([compiler_fields])  ; Constructor 4 = plu-ts, schema v1
                  / #6.126([compiler_fields])  ; Constructor 5 = OpShin, schema v1
                  ; Future schema versions will be assigned new constructor IDs

aiken_fields = [ source_url, commit_hash, source_path, compiler_version, env, parameters ]

compiler_fields = [ source_url, commit_hash, source_path / null, compiler_version, ? parameters ]

env = bytes .size (0..64)    ; UTF-8; empty = built without an environment flag;
                             ; non-empty values match [a-z][a-z0-9_]* in full
parameters = { * script_hash => parameter_list }
script_hash = bytes .size 28
parameter_list = [ * bytes ]  ; each element is a bytestring wrapping the CBOR
                              ; encoding of one parameter
```

### 7b. Productions retained as published

These follow the replacement block, with their published wording. In the
published file the four scalar productions sit between `compiler_fields` and
`parameters`; applying the replacement span moves them below it. Their text is
not modified.

```cddl
source_url = bytes          ; UTF-8 encoded URL
commit_hash = bytes         ; 20 or 32 bytes
source_path = bytes         ; UTF-8 encoded path
compiler_version = bytes    ; UTF-8 encoded version string

plutus_data = #6.121([* plutus_data])   ; Constr 0
            / #6.122([* plutus_data])   ; Constr 1
            / { * plutus_data => plutus_data }
            / [ * plutus_data ]
            / int
            / bytes
```

### 7c. Notes on the CDDL changes

- **`compiler_fields` is the published production, verbatim**, including
  `source_path / null` and `? parameters`. It is reflowed onto one line for
  readability; no element, order, or optionality is altered. Constructors 1–5
  therefore validate exactly as they did before this revision.
- **`aiken_fields` is new** and is referenced only by tag `#6.121`
  (constructor 0). It has six elements, all mandatory, matching the Aiken field
  table.
- **`parameter_list` erratum.** The published production reads
  `parameter_list = [ * plutus_data ]`, which does not describe the bytes the
  reference implementation has been writing since the first record: each
  parameter is a **bytestring wrapping** that parameter's CBOR encoding, not
  the parameter's CBOR inline. An independent implementation (`cip113-sdk-ts`)
  followed the published production and hit a real decoding failure against
  live mainnet records. This revision corrects the production to
  `[ * bytes ]` so the schema describes the wire bytes that already exist. This
  is an erratum, not a format change: no deployed record changes meaning, and
  no encoder changes behaviour.

## 8. `### Verification Process` — step 5

Replaces step 5 of the numbered list:

```markdown
5. **Compile**: Using the specified compiler and version, compile the source with any provided parameters and with the recorded build environment — for Aiken, `aiken build --env <env>` when the `env` field is non-empty, and with no environment flag when `env` is empty
```

The other steps are unchanged.

## 9. `## Rationale` additions

Two subsections appended to the Rationale, after `### Backward Compatibility`.

```markdown
### Residual Limits on Reproducibility

Recording the build environment closes the largest remaining gap between a
recorded build and a verifier's rebuild, but it does not close all of them. Two
known sources of drift remain for Aiken: dependency versions in `aiken.toml`
may be pinned to mutable git references, so a rebuild can resolve a dependency
to different source than the original build did; and trace flags are governed
by convention and defaults rather than being recorded in the metadata, so a
build that departed from the default convention will not be reproduced. Both
limits are fail-closed. The verification assertion is byte-equality between the
rebuilt script hash and the on-chain script hash, so a mismatch caused by either
source produces a **non-verification** — the record simply does not verify. No
combination of these limits can produce a false verification, because no
sequence of them can make an unequal pair of hashes compare equal.

### Compatibility Impact of the Aiken Schema Revision

The in-place revision of constructor 0 was assessed against the deployed record
corpus rather than argued in the abstract. At the time of this revision,
exactly six CIP-0171 records existed on Cardano mainnet under metadata label
1984, all submitted through the reference implementation:

- `7e6d7d45f072ad01b2ad3ced26c328f7afd0f7fefc6a490a914496f8f0f27bf2`
- `36f3377e558c8b8c7fa02be5bf117f02e318c3ac0008655cc7c7fe16d07f50d4`
- `f7e919f17c4842ce267e4606b7d6b6a5639fdb3d4848426f3240fdfa38f75a26`
- `ac5a74fe08d069b7a8993a4da46f212a5118823ff195a0df282e64fbe415008f`
- `2a88dd41f1fb85235fe97ab00fc0ea4ecfe11ea8ce13ba60cf9d10c0bec00e83`
- `5f6bf196a5d6388c699ac60ae878ff56288066797efdf95883ddcfeab63dd8a4`

All six were re-published by their author in the revised layout. The set of
records this document leaves undescribed is therefore empty, and the
compatibility cost of the revision is zero rather than small.

The same survey found 46 further transactions carrying metadata label 1984 from
unrelated projects, which use the label for their own purposes and do not
follow this standard. Label sharing is observed reality on mainnet, not a
hypothetical. This is why implementations MUST ignore records that do not
decode to a layout described here rather than treat them as errors: a
conforming reader will encounter non-conforming payloads under this label
routinely, and must remain unbothered by them.
```

---

# Amendment PR body (DRAFTED AND HELD)

**This section is not part of the CIP text.** It is the body for the upstream
pull request, drafted here and **held**. The PR to
`cardano-foundation/CIPs` is opened by Giovanni personally, and only after
preview sign-off, the mainnet replay of the existing records, and the main
deploy. No agent or automation opens it.

Drafting note on the shape of the body: the body pre-answers the
constructor-ID objection instead of waiting for a reviewer to raise it.
Precedent for that choice is `cardano-foundation/CIPs` PR #1092 (the CIP-0138
wire-format change, `Update` label), which pre-answered its own objection in
the body and merged in eight days — opened 2025-10-06, merged 2025-10-14
(verified against the GitHub API while planning this amendment).

The body itself follows.

---

**Title:** `CIP-0171 | Add env field to the Aiken schema`

---

## Summary

This PR amends CIP-0171 to record the **build environment** used to compile an
Aiken script. Aiken's `--env` flag selects an environment module at compile
time; two builds of the same commit with different `--env` values produce
different script hashes. Without recording it, a verifier rebuilding from the
metadata has no way to reproduce such a build, and a legitimately verifiable
script fails verification.

The change is scoped to **Aiken (constructor 0)** only:

- Constructor 0 becomes a fixed six-element list: `sourceUrl`, `commitHash`,
  `sourcePath`, `compilerVersion`, **`env`**, `parameters`. All fields are
  always present; optionality is expressed with empty values.
- Empty `env` bytes mean the build used **no** `--env` flag. It is not
  shorthand for `--env default` — an explicit default-environment build records
  `default`.
- **Constructors 1–5 are untouched.** Plutarch, PlutusTx, Scalus, plu-ts and
  OpShin keep the published five-field layout, the same optionality, and the
  same CDDL production. They carry no `env` field.

The `Discussions` preamble list gains this PR's URL, as CIP-0001 requires for
PRs that modify a CIP.

## The constructor-ID question, up front

The obvious objection to this PR is that CIP-0171 already says how field-layout
changes are made, and this PR does not do that. Quoting the CIP as merged:

> If a compiler requires changes to its field layout (adding, removing, or
> reordering fields), a new constructor ID is assigned for the updated schema
> version.

> Constructor IDs are assigned sequentially and MUST NOT be reused or
> reassigned.

This PR redefines constructor 0 in place rather than allocating constructor 6.
I am asking for a **one-time exception**, narrowed to constructor 0 and to this
revision, and the amendment text says so explicitly, keeps both rules in force
for everything else, and states that the exception is not a precedent.

There is recent precedent for this shape of change: PR #1092 (CIP-0138) made an
in-place wire-format change to a merged `Proposed` CIP under the `Update` label
and merged in eight days.

The grounds:

1. **The CIP is `Proposed`, not `Active`.** Proposed standards are revisable by
   design; that is the point of the status.
2. **Constructor 0 has one known implementation** — the reference
   implementation named in the CIP's own Implementation Plan.
3. **The prior records were replaced, not stranded.** Exactly six CIP-0171
   records existed on mainnet under label 1984, all from the reference
   implementation, and all six have been re-published in the revised layout.
   Their transaction hashes are listed in the amended Rationale so anyone can
   check the claim against the chain. The set of records the amended document
   no longer describes is empty.

The alternative — allocating constructor 6 for Aiken schema v2 — costs every
future reader a permanent dead branch in the parser and a constructor ID whose
only records were superseded within weeks of being written, in exchange for
compatibility with zero live records. I think the in-place revision is the
better trade here, but the decision is the editors'; if the meeting prefers a
new constructor ID, I will re-cut the PR that way.

## Also in this PR

- **`parameter_list` erratum.** The published CDDL says
  `parameter_list = [ * plutus_data ]`. The bytes actually written — since the
  first record, by the reference implementation — wrap each parameter's CBOR
  encoding in a bytestring. An independent implementation (`cip113-sdk-ts`)
  followed the published production and hit a decoding failure against live
  mainnet records. The production is corrected to `[ * bytes ]`, and the
  `Parameters` section's `Structure` line is updated to match. This changes no
  deployed record's meaning and no encoder's behaviour; it makes the schema
  describe the wire bytes that already exist.
- **Rationale: residual reproducibility limits.** Documents what recording
  `env` does *not* fix (mutable git refs for dependency pins, trace-flag
  conventions) and shows both are fail-closed: because verification asserts
  byte-equality of script hashes, they can only cause non-verification, never a
  false verification.
- **Rationale: compatibility impact**, including the six mainnet transaction
  hashes above, and the observation that 46 further label-1984 transactions
  come from unrelated projects — which is why the amendment keeps and
  strengthens the requirement that non-decoding records be ignored rather than
  treated as errors.

## Process

- This PR reworks an existing proposal, so it should carry the `Update` label
  and be introduced at a CIP meeting. Happy to attend the next biweekly triage
  to walk through the constructor-ID exception.
- The rendered CIP README on this branch is linked in the first comment below.
- I will not force-push during review — all changes will land as additional
  commits so reviewers keep their diff anchors.
