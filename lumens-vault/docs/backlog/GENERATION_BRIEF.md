# Issue Generation Brief

Read this fully before writing any issue. It is the contract for output shape and quality.
This file is a build input, not a deliverable — it can be deleted once the backlog is final.

## Ground truth about the repo (verified 2026-09-28, do not contradict)

- Project root is `C:\Users\HP\code\sorokeep\lumens-vault\`. **Nothing outside it may ever be
  touched** — the parent `sorokeep/` repo is a different, live project.
- The contract crate is at `lumens-vault/contracts/lumens-vault/`, the disposable upgrade
  fixture at `lumens-vault/contracts/lumens-vault-v2-fixture/`. Both are siblings; `test.rs`
  reaches the fixture via the relative path `../lumens-vault-v2-fixture/target/...`.
- `cargo test` currently passes **5/5**, and 10 consecutive full runs passed.
- `stellar contract build` on the main crate **succeeds**: 11,447 bytes, 16 exported functions.
  (Several handoff documents claim this was never demonstrated. It has been.)
- Toolchain present: rustc 1.98.1, stellar-cli 26.0.0, targets `wasm32v1-none` and
  `wasm32-unknown-unknown` installed.
- `backend/` and `frontend/` **do not exist yet**. Zero lines written.
- The four port interface files (`event-source.ts`, `price-oracle.ts`, `alert-sink.ts`,
  `persistence.ts`) exist but are misplaced in `contracts/`. They are good quality and
  type-check; they belong at `lumens-vault/backend/src/ports/`.
- `sorokeep@1.0.0` on npm does **not** export `verifyWebhookSignature`. It exists only on the
  parent repo's `main`. Any issue depending on that import must treat this as a blocker.
- Shell is **Windows PowerShell 7**. Any command an issue asks a contributor to run must be
  PowerShell-valid. No `rm -rf`, no `&&` chaining assumptions.

## Output format

Write one JSON file per epic to `lumens-vault/docs/backlog/epics/E<nn>.json`:

```json
{
  "epic": "E02",
  "title": "Contract: Lock Periods & Configuration",
  "milestone": "LV1 - Contract",
  "issues": [
    {
      "id": "E02-01",
      "title": "Replace VaultConfigV1's single lock field with min/max bounds",
      "labels": ["contract"],
      "requirements": ["FR-2"],
      "dependsOn": ["E01-01"],
      "scope": "One paragraph. What changes and what the boundary is.",
      "files": ["lumens-vault/contracts/lumens-vault/src/storage.rs (edit)"],
      "acceptance": [
        "VaultConfigV1 holds min_lock_ledgers and max_lock_ledgers; default_timelock_ledgers is gone",
        "`cargo test` output pasted in the PR"
      ],
      "nonGoals": ["No change to deposit's signature; that is E02-04"]
    }
  ]
}
```

Valid label values only: `contract`, `backend`, `frontend`, `devops`, `testing`, `docs`,
`design`, `security`, `sorokeep-integration`, `scaffolding`, `good first issue`, `bug`,
`breaking-change`, `blocked-external`.

## Quality bar

1. **One focused PR each.** If an issue would touch more than ~3 files or take more than a day,
   split it. The previous backlog's failure was epics disguised as issues.
2. **Acceptance criteria are checkable by a reviewer who did not write the code.** "Works
   correctly" is not acceptance. "Deposit with `lock_ledgers` one below `min_lock_ledgers`
   returns `Error::InvalidLockPeriod`, with the failing-case test output in the PR" is.
3. **Anything requiring verification names the command.** This project has a real history of
   claims stated as settled that were wrong — instance TTL auto-extension, event retention
   windows, temporary-storage caps, Sorokeep CLI flags. If an issue asks a contributor to
   confirm an external fact, it says which command or primary source proves it.
4. **Dependencies are minimal and real.** Only list a dependency if the issue genuinely cannot
   start without it. Over-declaring recreates the linear-chain problem. Most issues within an
   epic should be parallelisable with each other.
5. **Non-goals are specific**, and usually name the issue that owns the excluded work.
6. **No invented API surface.** If an issue needs a function that does not exist yet, either it
   depends on the issue that creates it, or creating it is that issue's own scope.
7. **Write for an external first-time contributor.** They have not read the handoff. Each issue
   stands alone.

## Tone

Plain, direct, specific. No marketing language, no "robust"/"seamless"/"comprehensive". Explain
*why* where the why is non-obvious or where a previous attempt got it wrong — that context is
what stops the same mistake recurring. Do not pad.
