# CIP-0171 amendment draft — `env` field (6-field layout)

Prepared 2026-08-10 alongside the uplc-link `feat/cip171-env-field` implementation.
Target: follow-up PR to cardano-foundation/CIPs updating CIP-0171 (merged as
Proposed via PR #1136).

## Process summary

- Amending a merged CIP is **just a follow-up PR** — same editor flow (bi-weekly
  triage, review, merge). PRs that rework an existing proposal get the `Update`
  label and are introduced at a CIP meeting. (CIP-0001 "Process"; CIPs wiki.)
- **Proposed status permits substantial edits** — only Active CIPs are frozen.
- No manual changelog needed: CIP text changelogs are auto-generated from git
  history (CIP-0001 "Versioning").
- PR naming: `CIP-0171 | Add env field and fix field layout`; link the branch
  README from the first PR comment; don't force-push during review.
- **Point to defend at the editor meeting:** CIP-0171's own versioning rule says
  field-layout changes get a *new constructor ID*. The in-place redefinition is
  a one-time exception — justified in the Versioning note below (Proposed
  status, single implementation, existing records replayed).

## Sections to change in CIP-0171/README.md

1. `### Field Layout` table — 5 → fixed 6 fields, `env` at index 4.
2. New `#### Env` subsection after `#### Compiler Version`.
3. `#### Parameters` — now index 5, always present (may be empty map).
4. `### CDDL Schema` — drop `source_path / null` and `? parameters`, add `env`.
5. `### Compiler and Schema Versioning` — add the in-place redefinition note.
6. `### Verification Process` step 5 — compile with recorded env
   (`aiken build --env <env>` when non-empty).
7. `## Abstract` — mention the build environment in the field enumeration.

## Drafted text

### Field table (replaces the table under `### Field Layout`)

```markdown
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
```

### `#### Env` subsection (new)

```markdown
#### Env

The `env` field records the build environment used to compile the script. For
Aiken (constructor 0), it contains the environment module name passed via
`aiken build --env <name>`.

Empty bytes indicate the build was invoked **without** the `--env` flag. This
is not shorthand for `--env default`: a build that explicitly uses the default
environment module MUST record `default`. Verifiers reproduce the build by
invoking the compiler with `--env <env>` when the field is non-empty, and with
no environment flag when it is empty.

A non-empty value MUST match `[a-z][a-z0-9_]*` and MUST NOT exceed 64 bytes.
Compilers without an equivalent build-environment concept MUST use empty bytes.
```

### CDDL (replaces `compiler_fields` and the field type lines)

```cddl
compiler_fields = [
    source_url,
    commit_hash,
    source_path,
    compiler_version,
    env,
    parameters
]

source_url = bytes           ; UTF-8 encoded URL
commit_hash = bytes          ; 20 or 32 bytes
source_path = bytes          ; UTF-8 encoded path; empty = repository root
compiler_version = bytes     ; UTF-8 encoded version string
env = bytes .size (0..64)    ; UTF-8; empty = built without an environment flag;
                             ; non-empty values match [a-z][a-z0-9_]*

parameters = { * script_hash => parameter_list }   ; may be empty
script_hash = bytes .size 28
parameter_list = [ * plutus_data ]
```

### Versioning note

```markdown
### Versioning note: in-place revision of the schema

This revision redefines the constructor field layout in place — from five
fields with two optional positions to a fixed six-element list adding `env` at
index 4 and moving `parameters` to index 5 — rather than assigning a new
constructor ID as this document's versioning rule would normally require. This
one-time exception is justified by circumstance: the standard is `Proposed`
with a single known implementation, and the small number of existing mainnet
records under label 1984 have been re-published by the reference implementation
using the revised layout, so no records encoded with the previous layout need
to be supported. Consumers MUST parse constructor IDs 0–5 as fixed six-field
lists per this document; records that do not decode to six fields SHOULD be
ignored. Any future change to a compiler's field layout MUST follow the
standard mechanism and be assigned a new constructor ID.
```

## Open decisions for the author

1. As drafted, the six-field layout applies to **all** constructors 0–5 (the
   CIP shares one layout across compilers); non-Aiken compilers use empty env
   bytes. If env should be Aiken-only, the CDDL needs an `aiken_fields` /
   `generic_fields` split — bigger surgery, not drafted.
2. Abstract + Verification Process step 5 one-liners are listed above but not
   drafted verbatim.
