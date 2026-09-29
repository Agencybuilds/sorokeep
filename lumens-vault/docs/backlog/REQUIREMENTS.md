# Lumens Vault — Requirements Register

The authoritative, numbered list of everything the backlog must cover. Every issue in
`ISSUE_BACKLOG.md` cites one or more IDs from this file, and `COVERAGE.md` proves that
every ID here maps to at least one issue.

Three sources feed this register:

- **FR-x / NFR-x** — from `docs/TECH_SPEC.md`. Unchanged wording, restated here so coverage
  can be checked mechanically.
- **G-x (Gap)** — defects and omissions found during the 2026-09-28 audit of the repo as it
  actually exists on disk. Each is stated with how it was verified, because several
  contradict what the handoff documents claim.
- **D-x (Decision)** — open decisions that must be closed by a specific issue rather than
  drifting. Carried from `PROJECT_HANDOFF.md` §3.6.

---

## Functional requirements (from TECH_SPEC §2)

| ID | Requirement |
|----|-------------|
| FR-1 | Users may deposit any admin-whitelisted asset. |
| FR-2 | Users select a lock period per deposit within admin-configured `[min_lock_ledgers, max_lock_ledgers]`. `lock_ledgers` is always required; bounds are global, not per-asset. |
| FR-3 | Withdrawal is single-step. Partial withdrawal is supported; the remainder stays locked under the same terms. |
| FR-4 | A user may hold multiple vaults, including several of the same asset. Vault IDs auto-increment per user. |
| FR-5 | No emergency withdrawal or lock bypass. `pause()` halts new deposits and withdrawals but never unlocks funds early. |
| FR-6 | No protocol fees in v1. |
| FR-7 | `amount` must be strictly positive on both deposit and withdraw. |
| FR-8 | A single `admin` Address. Production is a Stellar-native multisig account; the contract holds no multisig logic. **The account's MEDIUM threshold must be deliberately configured** — `require_auth()` on a classic G-account checks medium, not high. |
| FR-9 | Initialization is atomic with deployment via `__constructor`. |
| FR-10 | Admin can `pause()` / `unpause()`. |
| FR-11 | Admin can whitelist/delist assets. Delisting rejects new deposits but must never block withdrawal of existing balances. |
| FR-12 | Admin can `transfer_admin` to a new address. |
| FR-13 | Admin can `update_config` to change lock bounds without a contract upgrade. |
| FR-14 | Native WASM upgrade (`upgrade()`, admin-gated), all persisted structs wrapped in versioned enums. |
| FR-15 | The deployed contract is registered with the real Sorokeep tool for TTL monitoring and guard-based auto-extension of instance, WASM, and ideally individual `Vault(...)` entries. |
| FR-16 | Sorokeep alert webhooks are received, signature-verified with `verifyWebhookSignature`, and stored for display. |
| FR-17 | Per-user vault lists and balances are reconstructed from contract events, since the contract has no enumeration. |
| FR-18 | Admin actions (pause/unpause/upgrade/whitelist/delist/transfer_admin/config_updated) are detected and surfaced. Sorokeep never does this. |
| FR-19 | USD valuation via Reflector (SEP-40), off-chain only, simulation-only reads, with staleness and deviation guards. |
| FR-20 | Freighter wallet connection for transaction signing. |
| FR-21 | Deposit flow includes a lock-period picker reading live min/max from the contract, not hardcoded. |
| FR-22 | A "my vaults" view backed by FR-17. |
| FR-23 | An operations/health page showing real Sorokeep data, not mocked. |
| FR-24 | **Process gate.** No frontend implementation begins before wireframes exist and are explicitly approved. |

## Non-functional requirements (from TECH_SPEC §3)

| ID | Requirement |
|----|-------------|
| NFR-1 | No known critical vulnerability before any mainnet deployment. |
| NFR-2 | Every variant of the contract's `Error` enum is exercised by at least one test that actually triggers it. |
| NFR-3 | All contract events stay within the 4-topic ceiling; high-cardinality fields go in data. |
| NFR-4 | The backend data layer is a best-effort display cache, never a source of truth for fund safety. Withdraw eligibility is always decided by a live on-chain check. |
| NFR-5 | Contract functions extend the TTL only of entries they touch. Sorokeep's guard is the backstop for dormant entries. |
| NFR-6 | The contract exposes point lookups, not enumeration. |
| NFR-7 | Every architectural or scope decision is recorded with status and, where a factual claim underlies it, its source. |

---

## Gaps found in the 2026-09-28 repo audit

Each was verified against the repo as it exists, not inferred from the handoff docs.

| ID | Gap | How it was verified |
|----|-----|---------------------|
| G-1 | `lumens-vault/.git` is an empty nested repo (zero commits, no remote) and blocks all commits. | `git add -n lumens-vault/` → `error: 'lumens-vault/' does not have a commit checked out`. |
| G-2 | `lumens-vault/README.md` does not exist, yet `CONTRIBUTING.md` tells contributors "Build and test commands are in the root README.md". | `ls lumens-vault/*.md` — only CONTRIBUTING, HANDOFF_ADDENDUM, ISSUE_BACKLOG, PROJECT_HANDOFF. |
| G-3 | Stale assistant-voice comments remain in 5 source files, including a "I could not run any of this" banner in `test.rs` that is now false. | `grep` across `contracts/**/*.rs`. |
| G-4 | The four port interface `.ts` files sit in `contracts/`, a Rust crate folder, instead of `backend/src/ports/`. | `ls lumens-vault/contracts/*.ts`. |
| G-5 | `contracts/lumens-vault/test/` is a stale duplicate of `test_snapshots/test/` and holds an orphan snapshot from a since-renamed test. | Live dir rewritten at 12:03 by a real `cargo test`; stale dir frozen at 09-24 08:52. |
| G-6 | `contracts/lumens-vault-backup-original/` holds the superseded, known-vulnerable pre-fix contract (front-runnable `initialize`, unchecked amounts) as loose `.rs` files with no Cargo.toml. | `diff` against current `src/`. |
| G-7 | **`sorokeep@1.0.0` on npm does not export `verifyWebhookSignature`.** FR-16 and the entire justification for a TypeScript backend depend on it. It exists only on `main` (commit `34148c8`, PR #742, merged 2026-09-28) and is unpublished; `package.json` is still `1.0.0`. | Unpacked the published tarball; `dist/lib.d.ts` exports only `watchContract`, `runMonitorCycle`, `inspectContract`, `parseSacBalance`, `buildSacBalanceKeyXdr`, `formatTokenBalance`, `AWSSecretsResolver`. |
| G-8 | The old Issue 1 prescribes pinning the ledger sequence to fix a flaky upgrade test, but the likelier cause is build ordering: `contractimport!` reads the fixture wasm at **compile** time, and the handoff itself documents a Windows `os error 32` file-in-use failure. A pin is already applied at `1000` (not the specified `100_000`), so the issue is half-done against its own criteria. | Read `test.rs:213`; 10/10 consecutive passing runs with the fixture wasm present, which does not discriminate between the two explanations. |
| G-9 | **Authorization is never actually tested.** All five tests call `env.mock_all_auths()`, which bypasses `require_auth()` wholesale, so no test proves an unauthorized caller is rejected for any admin function. | `grep mock_all_auths src/test.rs` — present in every test. |
| G-10 | `Error::NotInitialized` may be unreachable now that `__constructor` is atomic, which makes NFR-2 unsatisfiable for that variant. | Constructor unconditionally writes Admin, Config and State. |
| G-11 | Zero-balance vaults are never removed. `withdraw` decrements to 0 and leaves the entry in persistent storage indefinitely, still paying rent and still requiring TTL extension. | `contract.rs` `withdraw` — no delete branch. |
| G-12 | `remove_asset` writes `false` rather than deleting the key, so instance storage grows permanently with every delisted asset, against a capped instance entry size. | `contract.rs` `remove_asset`. |
| G-13 | `current_count + 1` in `deposit` is unchecked u32 arithmetic (vault-id overflow). The old Issue 2 covers checked arithmetic for `unlock_ledger` only. | `contract.rs` `deposit`. |
| G-14 | No issue actually deploys to testnet. Old Issue 3 writes the deploy script; old Issue 7 assumes "the deployed contract" exists. | Read both issue bodies. |
| G-15 | No CI of any kind. Nothing runs `cargo test` or `stellar contract build` on a PR, for a project explicitly inviting external contributors. | No workflow files under `lumens-vault/`. |
| G-16 | No backend configuration story — RPC URL, contract ID, webhook secret, Reflector contract ID, DB path. No `.env.example`, not in any issue. | Absent from SCAFFOLD_BRIEF and all 11 issues. |
| G-17 | `SCAFFOLD_BRIEF.md`'s frontend tree omits `app/layout.tsx`, which the App Router requires, and simultaneously says "standard create-next-app defaults" and "nothing extra" — which contradict. | Read the brief's tree against create-next-app output. |
| G-18 | `TECH_SPEC.md` FR-2 and Open Questions 1 and 2 still read OPEN, but `PROJECT_HANDOFF.md` §3.1 records them as DECIDED by the user. The handoff's own rule is "the docs win", which here propagates a stale answer. | Compared both documents. |
| G-19 | `CONTRIBUTING.md` references a `blocked` label the addendum deliberately removed, and a `README.md` that does not exist. | Read CONTRIBUTING lines 62 and 59. |
| G-20 | No integration or end-to-end coverage anywhere: nothing exercises deploy → deposit → event ingested → dashboard displays across the three deployables. | Absent from all 11 issues. |
| G-21 | No LICENSE for `lumens-vault/`, and no issue for the post-Wave-9 migration to its own repository. | `ls lumens-vault/`; handoff §3.6 mentions migration with no issue. |
| G-22 | Partial withdrawal (FR-3) is implemented but has no test. | `grep` of `test.rs` — no partial-withdraw assertion beyond one incidental case. |
| G-23 | Multiple vaults per user and multiple vaults of the same asset (FR-4) are implemented but have no test. | `test.rs` — every test uses a single vault. |
| G-24 | The backend has no observability plan of its own — no health endpoint, structured logging or error taxonomy — in a project whose purpose is to showcase monitoring. | Absent from SCAFFOLD_BRIEF and all 11 issues. |
| G-25 | The old backlog is a strictly linear 11-issue chain ("Issue N merges before issue N+1"), which permits exactly one contributor at a time and blocks all frontend work behind nine merges. | `ISSUE_BACKLOG.md` line 5. |

---

## Open decisions that must be closed by a named issue

| ID | Decision | Carried from |
|----|----------|--------------|
| D-1 | Exact Sorokeep CLI surface for guard policies and per-entry storage-key tracking. Verify against live `--help`. | Handoff §3.6 Q3 |
| D-2 | Admin account model: classic multisig G-account with deliberate medium threshold, vs. a Soroban smart-contract account. | Handoff §3.6 Q4, FR-8 |
| D-3 | The chosen RPC provider's real `getEvents` retention window, confirmed via `getHealth`, driving polling cadence and outage recovery. | Handoff §3.6 Q5 |
| D-4 | Data source for the Operations page beyond webhook alerts: Sorokeep `--json` CLI, its SQLite DB, or its MCP server. | Handoff §3.6 |
| D-5 | Whether Lumens Vault issues live in `TegoLabs/sorokeep`'s tracker under the `lumens-vault` label. | Handoff §3.6 |
| D-6 | Constructor-arg flag spelling (kebab vs. snake case) for `stellar contract deploy`. | Handoff §3.6 |
| D-7 | Whether `test_snapshots/` is committed or ignored. | Handoff §1.4 |
| D-8 | Whether an archived-entry restore prompt is in v1 scope for the frontend. | Old Issue 10 |
| D-9 | Whether `Error::NotInitialized` is removed or retained with documented justification. | G-10 |
| D-10 | How the backend depends on `sorokeep` until a version exporting `verifyWebhookSignature` is published. | G-7 |
