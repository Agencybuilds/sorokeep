# PROJECT HANDOFF CONTEXT

> Compiled 2026-09-28 from the full design and review conversation. Audience: an autonomous coding agent (Claude Code) working in the user's terminal on Windows/PowerShell.
> Tags used below: **DECIDED** (settled), **VERIFIED** (confirmed against a primary source or a real run), **CORRECTED** (an earlier claim was wrong and has been replaced), **OPEN** (not decided, do not build against it silently), **RECOMMENDED** (the assistant's suggestion, not yet confirmed by the user).

---

## 1. Core Objective & Scope

### 1.1 What is being built

**Lumens Vault** is a time-locked, multi-asset savings vault on Stellar Soroban.

- Users deposit an admin-whitelisted asset and choose a lock period per deposit (within admin-set bounds). They cannot withdraw until the lock expires.
- One user can hold multiple vaults across multiple assets.
- An admin can pause, whitelist/delist assets, change config, transfer the admin role, and upgrade the contract WASM in place. In production the admin is intended to be a Stellar-native multisig account.
- No yield, no fees, no emergency unlock in v1.
- Testnet first, mainnet-ready by configuration (no hardcoded network URLs).

Two purposes, both real: (1) a useful savings primitive; (2) the real-world proving ground for **Sorokeep** (github.com/TegoLabs/sorokeep), whose job is monitoring and auto-extending storage TTLs. Every vault is one persistent ledger entry, so many vaults means many TTLs to manage.

### 1.2 Relationship to Sorokeep (CRITICAL, restated because it was misunderstood repeatedly)

- Sorokeep is a **real, already-built, separate tool**: TypeScript CLI + daemon, npm package `sorokeep`, MIT licensed, about 891 tests, SQLite local store. It is NOT part of this project's codebase and must NOT be reimplemented.
- Lumens Vault is a **completely different project** with its own GitHub repository (already exists, currently unused).
- For the duration of Stellar **Drips Wave 9** it is developed inside the `sorokeep` repository, in ONE self-contained folder `sorokeep/lumens-vault/`. After Wave 9 that folder moves to its own repo. Therefore **nothing Lumens-Vault-specific may exist outside `lumens-vault/`**. Sorokeep's own root files and folders (`src/`, `tests/`, `docs/`, `scripts/`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, and so on) must never be touched or overwritten. Sorokeep upstream has NO `contracts/` folder.
- Lumens Vault installs `sorokeep` as an npm dependency where the app needs its exports (notably `verifyWebhookSignature`) and drives it via its CLI.

### 1.3 Who does what (DECIDED)

- **Claude (chat)**: PM / senior-engineer role: specs, verification research, issue writing, review of PRs for scope and security, wireframes via the chat's Design artifact type (not a separate product).
- **Claude Code (you)**: implementation of issues, one at a time, in order. Also repo hygiene and git operations (see below).
- **Gemini**: scaffolding ONLY (Issue 5), bounded by `SCAFFOLD_BRIEF.md`. Gemini's track record on this project is poor (see §3.5), so its output is reviewed against the brief before merge.
- **User (Chibuzor)**: final merge authority and decision-maker. Works on Windows, PowerShell 7.6.6, path `C:\Users\HP\code\sorokeep`. Prefers concise, direct answers and complete runnable outputs.
- **Git operations**: the user will NOT commit or push. The coding agent does it when instructed. Nothing has been committed or pushed yet.
- Work is issue-driven; external contributors may pick up issues; the user decides what merges.

### 1.4 Exact state of the project right now

- The Rust contract exists, has been fixed (see §6), and `cargo test` was run by the user: 5 tests. Run 1 had `test_real_upgrade_and_state_migration` FAIL once (flaky); run 2 passed 5/5 with no code change. The flaky-test fix (Issue 1) is NOT yet applied.
- The fixture crate `lumens-vault-v2-fixture` builds with `stellar contract build` (about 2.9 KB wasm, exports `get_vault` and `version`) after adding `overflow-checks = true` to its `[profile.release]`.
- The main contract crate has been tested natively only. **It has not been shown to build to `wasm32v1-none`.** Verify with `stellar contract build`.
- Filesystem (last known): `C:\Users\HP\code\sorokeep\contracts\lumens-vault\` and `...\contracts\lumens-vault-v2-fixture\` (sorokeep root wrongly contains a `contracts/` folder). A `mkdir lumens-vault; Move-Item contracts lumens-vault\contracts` correction was instructed but its completion is UNCONFIRMED. Verify with `git status` and `ls`.
- Known hygiene defects (fix in Phase 0, §5):
  - `contracts\lumens-vault\.git` is an empty nested repo (zero commits, from a zip) and will break `git add` in sorokeep.
  - The fixture has no `.gitignore` (its `target/` is about 1 GB).
  - An old "fixes" `README.md` may still sit inside `contracts\lumens-vault\` and is obsolete.
  - Stale first-person/assistant-voice comments remain in `test.rs` (banner "I could not run any of this…"), in the contract header change-log comment, in `events.rs`, and in the fixture `Cargo.toml`. Keep the technical content, remove the voice and obsolete claims.
  - The main crate `Cargo.toml` uses deprecated `[dev_dependencies]`; change it to `[dev-dependencies]`.
  - `test_snapshots/` is auto-generated by soroban-sdk; old snapshots are stale and regenerate on test runs.
- Documents already produced (to be placed inside `lumens-vault/`, see §5 Phase 0): `README.md`, `CONTRIBUTING.md`, `docs/TECH_SPEC.md`, `docs/SYSTEM_DESIGN.md`, `docs/SCAFFOLD_BRIEF.md`, `ISSUE_BACKLOG.md`, `create_issues.ps1`. `SYSTEM_DESIGN.md` and `TECH_SPEC.md` were updated to mark the architecture as DECIDED (earlier copies say "open" and contradict the scaffold brief; make sure the updated copies are the ones used).
- GitHub issues have NOT been created yet. `README.md` currently says "Stellar Community Fund's Drips Wave 9", which is an unverified attribution; correct it to "Drips Wave 9 (Stellar)".

---

## 2. Technical Stack & Architecture

### 2.1 Stack

| Area                    | Choice                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract                | Rust, `soroban-sdk = "28"` (locked 28.0.0, soroban-env 28.0.2), `#![no_std]`, build target `wasm32v1-none`                                                                                                               |
| Rust toolchain          | ≥ 1.85 (soroban-sdk 28's dependency tree needs edition2024, stabilized in Rust 1.85.0; VERIFIED)                                                                                                                         |
| Build CLI               | `stellar contract build` (user has stellar-cli 26.0.0, 28.0.0 available). It requires `overflow-checks = true` under `[profile.release]`                                                                                 |
| Backend                 | TypeScript, Node (Sorokeep needs Node 22+), `express`, `better-sqlite3`, `@stellar/stellar-sdk`, `sorokeep` (npm), `vitest`                                                                                              |
| Frontend                | Next.js, TypeScript, app router; Freighter wallet for signing                                                                                                                                                            |
| Persistence (off-chain) | SQLite (display cache, not source of truth)                                                                                                                                                                              |
| Networks                | testnet default. Sorokeep README lists testnet RPC `https://soroban-testnet.stellar.org` and mainnet `https://mainnet.sorobanrpc.com`. Keep them configurable                                                            |
| Dev shell               | Windows PowerShell 7.6.6. Use PowerShell syntax only (`Remove-Item -Recurse -Force`, `Move-Item -Path … -Destination …`, `@' … '@` here-strings starting at line beginning; no `rm -rf`, no `&&`-style Unix assumptions) |
| Windows gotcha seen     | first fixture build failed with `os error 32` (file in use); `cargo clean` then rebuild succeeded                                                                                                                        |

Why the backend is TypeScript (DECIDED, do not re-litigate): `sorokeep` is an npm package; `verifyWebhookSignature` is imported natively. Any other language means shelling out or reimplementing HMAC verification, which repeats the mistake of reinventing what Sorokeep already does.

### 2.2 Architecture (DECIDED, VERIFIED against precedent)

- **Three deployables**: Soroban contract, ONE `backend/` process, `frontend/` app. Sorokeep is external.
- **Backend = modular monolith** with **hexagonal (ports & adapters)** internals. Evidence: seven comparable real Soroban dapp repos were checked (lending, remittance, supply chain, subscriptions, AMM, grants, vault). All use `contracts/` + `backend/` + `frontend/`, and every backend is ONE service even when it does several jobs. None uses microservices. Reasons for this project: small team, contributors take one scoped issue at a time, display layer has a deliberately low correctness bar (NFR-4). Microservices add cost with no scaling benefit.
- Ports and adapters fit because the backend talks to several swappable external systems (RPC, Reflector, Sorokeep webhook, persistence) that the spec requires testing in isolation (fresh/stale/deviating prices, dedup on retry, signature verification).
- The user originally wrote "diagonal architecture", which is not a recognized pattern. It was treated as **hexagonal**. Not explicitly confirmed by the user.
- No root-level monorepo/workspace tool (Turborepo, Nx). `backend/` and `frontend/` share no code; they talk over HTTP.
- **Scaling**: do not pre-split. Keep port/adapter boundaries clean so extraction into a service is mechanical if a measured need appears. Storage-growth scaling is Sorokeep's job. Contributor scaling is what the boundaries buy. SQLite is adequate at this stage.

### 2.3 Folder structure (all inside `lumens-vault/`)

```
sorokeep/                         # untouched, all of it
└── lumens-vault/                 # the entire self-contained project
    ├── contracts/
    │   ├── lumens-vault/         # real contract crate (standalone package, not a workspace member)
    │   └── lumens-vault-v2-fixture/  # disposable test-only crate (proves upgrade path)
    ├── backend/
    │   ├── src/
    │   │   ├── domain/           # vault-state.ts, alert-correlation.ts, valuation.ts
    │   │   ├── ports/            # event-source.ts, price-oracle.ts, alert-sink.ts, persistence.ts
    │   │   ├── adapters/         # soroban-rpc/, reflector/, sorokeep-webhook/, sqlite/
    │   │   └── api/index.ts
    │   ├── test/
    │   ├── package.json  tsconfig.json  .gitignore
    ├── frontend/                 # Next.js, blocked on wireframes
    │   ├── app/{page.tsx, deposit/page.tsx, vaults/page.tsx, operations/page.tsx}
    │   ├── package.json  tsconfig.json  next.config.ts
    ├── docs/                     # TECH_SPEC.md SYSTEM_DESIGN.md SCAFFOLD_BRIEF.md (+ later deploy.md sorokeep-setup.md wireframes.md)
    ├── scripts/                  # deploy tooling
    ├── README.md
    └── CONTRIBUTING.md
```

Naming note: `contracts/lumens-vault/` repeats the project name because it is the primary crate inside a folder that may hold several crates. This is standard, and renaming it to `contracts/vault/` is optional and cosmetic. Do not rename unless asked. `backend/` (not "events-reader" or "app-data") matches what comparable Soroban projects call it.

### 2.4 Components and responsibilities

1. **Smart contract (on-chain)**: single source of truth for fund safety: whitelist, pause, lock-bounds, balance arithmetic, lock expiry, events, point-lookup views, native upgrade. It does NOT own price data, vault enumeration, or cross-contract calls beyond the SAC token interface.
2. **Sorokeep (external)**: TTL/lifecycle health of instance, WASM and (ideally) individual `Vault(...)` entries; guard auto-extension; alerts; costs. Consumed via CLI at deploy time and via webhook output.
3. **Backend responsibilities** (one process, modules per adapter): event ingestion, state reconstruction, admin-action detection/alerting, Sorokeep-webhook receipt and storage, Reflector price valuation, read API for the frontend.
4. **Frontend**: wallet connection, deposit/withdraw with lock-period picker, my-vaults list, operations/health page, dashboard with USD totals.

### 2.5 Data flows

- **Deposit**: User → Frontend → Freighter signs → Contract (writes `VaultEntry` + `UserVaultCount`, extends TTL of what it touched, emits `DepositEvent`) → backend polls `getEvents` and ingests → dashboard updates.
- **Lifecycle safety (separate path, not through app events)**: Sorokeep daemon polls storage TTL via RPC → extends per guard policy → fires webhook alert on threshold crossing → backend verifies (`verifyWebhookSignature`) and stores → Operations page displays.
- **Valuation**: backend simulates Reflector `lastprice()` → staleness and deviation guards → USD figure for display only. The vault contract is never involved.
- Working assumption (OPEN, verify against Sorokeep source): Sorokeep reads storage/TTL directly and does not consume the contract's application events. Basis: its documented CLI and DB schema (`contracts`, `contract_entries`, `extension_policies`, `alert_configs`, `alerts_fired`, `extension_history`) are entirely about entry lifecycle.

### 2.6 Sorokeep facts (from its README; VERIFY flags with live `--help` before use)

- Commands: `watch`, `status`, `daemon`, `alerts` (add/list/remove/test/history), `guard`, `costs`, `restore`, `resources`, `budget`, `channels`, `inspect`, `check`, `db`, `completion`, `contracts` (`--json`). Also an MCP server.
- `sorokeep watch <contract-id> --network testnet --name "…" [--rpc-url …] [--storage-keys <comma-separated base64 XDR keys>]`. Entry discovery layers: deterministic (instance + WASM), footprint-based (daemon), manual (`--storage-keys`).
- `sorokeep guard <id> --preset conservative|balanced|aggressive --keypair-env <VAR> --auto-extend [--dry-run|--disable]`. Presets: conservative = target 518,400 / threshold 103,680 ledgers; balanced = 100,000 / 20,000; aggressive = 51,840 / 8,640. `--preset` cannot combine with `--target-ttl`/`--threshold`. Secret keys are never stored; only the env var name and public key. Never commit a secret.
- `sorokeep alerts add --contract <id> --type webhook|slack --url <url> --threshold <ledgers> [--secret …]`. The README FAQ also mentions repeating `--target <type:target>`.
- Webhook header: `X-Sorokeep-Signature: sha256=<hex>` (HMAC-SHA256). `import { verifyWebhookSignature } from "sorokeep"; verifyWebhookSignature(payload, signature, secret)`.
- Webhook JSON fields: `type` (`threshold_crossed`/`alert_resolved`), `severity`, `contractId`, `contractName`, `network`, `entry{keyXdr,type,label}`, `threshold{configuredLedgers,currentRemainingLedgers,approximateTimeRemaining}`, `firedAtLedger`, `timestamp`.
- Local DB `~/.sorokeep/sorokeep.db` (SQLite WAL). Daemon cycle default 5 minutes: monitor → deliver → auto-extend.

### 2.7 Verified technical facts (with corrections of earlier wrong claims)

- **VERIFIED**: `wasm32v1-none` is the only build target the Soroban runtime supports (Rust ≥ 1.84 per Stellar's dev skill docs).
- **VERIFIED**: instance-storage TTL does NOT auto-extend on invocation. The contract must call `env.storage().instance().extend_ttl(...)` (Stellar docs, OpenZeppelin docs). The contract does this correctly (see §6). CORRECTED: an earlier research note claimed it auto-extends.
- **VERIFIED**: `extend_ttl` on persistent entries only covers entries touched. An archived persistent entry in a tx footprint prevents the tx from executing until `RestoreFootprintOp`.
- **VERIFIED**: Stellar SCP gives immediate finality; no probabilistic reorgs. CORRECTED: earlier docs justified event dedup with "chain re-orgs". Dedup is still needed for overlapping poll windows and retries. Do NOT build reorg rollback logic.
- **VERIFIED**: `getEvents` retention: the network can support up to 7 days; RPC nodes retain only what the operator configures (`ledgerRetentionWindow` from `getHealth`); public nodes commonly default to 24 hours. CORRECTED: an earlier doc stated 120,960 ledgers (about 7 days) as a fixed default. Confirm the actual provider's retention directly. Also found: `getEvents` `limit` is capped at 10,000 records per response (a record cap, not a ledger-span scan cap; re-verify at implementation time).
- **VERIFIED (indirect)**: treat 4 as a hard ceiling on event topics. The SDK type system does not enforce it (Vec-based topics have no type-level limit), but dedicated static-analysis tooling exists specifically to flag more than 4. Put high-cardinality fields (`vault_id`, `amount`) in event data. UNVERIFIED: the exact topic count a bare `#[contractevent]` generates (does it prepend an implicit name topic?). Add a test that prints `env.events().all()` per event type.
- **CORRECTED**: temporary storage is NOT capped at about 8 days. Default TTL on creation is 1 day, and it can be extended to the same network max entry TTL as persistent (about 6 months, 3,110,400 ledgers). Persistent entries are created with 120 days. 5 s per ledger, 17,280 ledgers per day. The decision to use `unlock_ledger` ledger-sequence comparison (never TTL) for locks remains correct on independent grounds: TTL is permissionless and extendable by anyone.
- **VERIFIED**: `__constructor` runs atomically during deployment (supported since soroban-sdk/protocol 22) and cannot be invoked again. `admin.require_auth()` alone does NOT stop initializer front-running. Only atomic deploy+init does.
- **VERIFIED**: `require_auth()` on a classic multisig G-account checks the account's **medium threshold**, not high. A team could add signers and still have `require_auth()` pass with fewer signatures than intended if the medium threshold is not set deliberately. Alternative: a Soroban smart-contract account (C-address, custom `__check_auth`), which is more flexible but documented as needing rigorous review with simulation tooling still maturing.
- **VERIFIED**: the Stellar-documented upgrade-test pattern: `contractimport!` of the new compiled wasm + `env.deployer().upload_contract_wasm(WASM)` + `client.upgrade(&hash)`, then assert behavior changed.
- **VERIFIED**: Reflector is Stellar's production price oracle (documented at developers.stellar.org/docs/data/oracles), speaks SEP-40 (`base`, `assets`, `decimals`, `resolution`, `price`, `prices`, `lastprice`; types `Asset`, `PriceData`), governed by a multisig of independent node operators. Real integrations treat staleness and deviation guards as mandatory. Do NOT hardcode contract IDs from memory; take them from Reflector's official docs and cross-check on stellar.expert.
- **CORRECTED**: OpenZeppelin's Soroban library is `OpenZeppelin/stellar-contracts` (crates `stellar-tokens`, `stellar-access`, …), and its release notes carry a "not yet audited, not ready for production" warning as of the version checked. Do not cite it as "battle-tested". Blend Protocol's Certora/Code4rena audits were Feb–Mar 2025, not August 2025.

---

## 3. Explicit Requirements & Constraints

### 3.1 Functional requirements

**Vault core**

- FR-1 DECIDED: deposit any admin-whitelisted asset.
- FR-2 DECIDED: user chooses a lock period per deposit within admin-configured global `[min_lock_ledgers, max_lock_ledgers]`. **Decision confirmed by the user ("whatever is best"): `lock_ledgers` is ALWAYS a required parameter (no default fallback), and the bounds are GLOBAL (not per-asset).** The single `default_timelock_ledgers` config field is therefore removed and replaced by min/max.
- FR-3 DECIDED: single-step withdrawal (not two-step initiate/claim; two-step is a possible v2 feature). Partial withdrawal supported; remainder stays locked under the same terms.
- FR-4 DECIDED: multiple vaults per user, including several of the same asset; vault IDs auto-increment per user.
- FR-5 DECIDED: no emergency withdrawal or lock bypass. `pause()` halts new deposits AND withdrawals but never unlocks funds early.
- FR-6 DECIDED: no protocol fees in v1.
- FR-7 VERIFIED: `amount` strictly positive on deposit and withdraw (a negative withdraw amount used to skip the balance check and inflate the recorded balance).

**Admin & governance**

- FR-8 DECIDED: single `admin` Address; production = Stellar-native multisig account; no multisig logic in the contract. Required setup caveat: the account's MEDIUM threshold must be deliberately configured (see §2.7). Default assumption is classic multisig G-account (OPEN, see §3.6).
- FR-9 VERIFIED: initialization via `__constructor` (atomic with deploy).
- FR-10 DECIDED: admin `pause()`/`unpause()`.
- FR-11 VERIFIED: admin whitelist/delist. Delisting rejects new deposits but must NEVER block withdrawal of existing balances (`withdraw` deliberately has no whitelist check).
- FR-12 DECIDED: `transfer_admin`.
- FR-13 DECIDED: `update_config` changes lock bounds without an upgrade.
- FR-14 VERIFIED: native WASM upgrade (`upgrade()`, admin-gated). All persisted structs are wrapped in versioned enums (`VaultEntry::V1(..)` and so on) so later versions add variants. Verified with a real two-binary upgrade test, not a same-binary round trip.

**Lifecycle safety (Sorokeep)**

- FR-15 DECIDED: register the deployed contract with real Sorokeep for TTL monitoring and guard auto-extension of instance, WASM and ideally individual `Vault(...)` entries. Exact flags OPEN until verified against live `--help`.
- FR-16 DECIDED: receive Sorokeep webhooks, verify with `verifyWebhookSignature`, store for display. Do not reimplement TTL polling or auto-extension anywhere else.

**Application data**

- FR-17 DECIDED: reconstruct per-user vault lists and balances from contract events (the contract has no enumeration).
- FR-18 DECIDED: detect and surface admin actions (pause/unpause/upgrade/whitelist/delist/transfer_admin). Sorokeep never does this.
- FR-19 DECIDED: USD valuation via Reflector, **off-chain only**, simulation-only reads (no signing, no fees), with staleness guard and deviation guard. USER DECISION: USD valuation is IN scope for v1. Nothing on-chain depends on price, so the contract never calls the oracle.

**Frontend**

- FR-20 Freighter wallet connection. FR-21 deposit flow with lock-period picker reading live bounds from the contract. FR-22 my-vaults view. FR-23 operations/health page showing real Sorokeep data. FR-24 HARD GATE: no frontend implementation before wireframes/mockups exist and are explicitly approved (this rule was broken twice before).

### 3.2 Non-functional requirements

- NFR-1 Security: no known critical vulnerability before any mainnet deployment. Closed: unauthenticated initializer, unchecked amounts, `UserVaultCount` TTL never extended. Open: upgrade path proven mechanically in a test but not yet dry-run on live testnet with two independent deployments.
- NFR-2 Every `Error` variant is triggered by at least one test.
- NFR-3 Events stay within the 4-topic ceiling; high-cardinality fields in data.
- NFR-4 The backend data layer is a best-effort display cache, never a source of truth for fund safety. If it is down or wrong the worst outcome is a stale number. Withdraw eligibility is always decided by a live on-chain check. This bounds how much reliability engineering it gets.
- NFR-5 Contract functions extend only the TTL of entries they touch. Sorokeep's guard is the backstop for dormant entries. The contract does not extend speculatively.
- NFR-6 The contract exposes point lookups, not "list everything". Enumeration is an application-layer concern.
- NFR-7 Every architectural or scope decision is recorded with status and, where a factual claim underlies it, its source.

### 3.3 Explicit non-goals (v1)

No yield/staking/interest; no emergency withdrawal; no fees; no on-chain price awareness; no multi-oracle aggregation (Reflector alone); no PagerDuty/Postgres/Redis/audit-log-grade infrastructure in the backend; no in-contract multisig; no microservices; no root monorepo tool; no reorg-rollback logic; no custom TTL monitoring or auto-extension (that is Sorokeep).

### 3.4 [IMPORTANT] Things to AVOID (strict)

1. Never create, edit or delete anything outside `lumens-vault/`. Never touch sorokeep's own files. Never create a root-level `contracts/`, `backend/`, `frontend/`, `docs/`, `scripts/` or root `README.md`/`CONTRIBUTING.md` for this project.
2. Never write business logic during scaffolding; stubs only.
3. Never build frontend UI before wireframes are approved (FR-24).
4. Never reimplement Sorokeep functionality (TTL polling, extension, alerting).
5. Never put price reads in the Soroban contract.
6. Never assert "tests pass" or "it builds" without running the command and showing real output. For anything TTL- or upgrade-related, run it repeatedly (the upgrade test already flaked once).
7. Never trust remembered or secondhand facts about Soroban/Stellar SDK behavior, Sorokeep CLI flags, or Reflector contract IDs. Verify against primary sources (the corrections in §2.7 are exactly these mistakes).
8. Never renumber shipped `Error` codes if the contract has been deployed anywhere. Nothing is deployed today, so appending is preferred anyway (add new variants at the end).
9. Never mutate `VaultConfigV1`/`VaultEntryV1` in place if any deployed instance exists; add a V2 variant instead. (Today nothing is deployed, so Issue 2 may change `VaultConfigV1`. Confirm that assumption first.)
10. Never commit secrets (Stellar secret keys, Slack tokens, webhook secrets). Guard keypairs are referenced by env var name only.
11. Never expand an issue's scope silently. If scope seems wrong, stop and comment. Non-goals sections are binding.
12. Never run destructive git operations, and never commit `target/`, nested `.git` directories, or files outside `lumens-vault/`. Run `git status` before every commit.
13. Never use Unix-only shell syntax in instructions for the user (PowerShell environment).

### 3.5 Process rules and why they exist (real history)

- The first design attempt (Gemini) silently dropped requirements from the original Claude Code design (`update_config`, `transfer_admin`, user-selectable lock periods) and later "discovered" them as critical findings; built a lookalike Express/Postgres "Sorokeep daemon" instead of using the real tool; scaffolded a Next.js app and mockups without sign-off three times; and reported an upgrade test as done when it only round-tripped storage in a single binary. Wrong facts were stated as settled (instance TTL auto-extends, reorg handling, 120,960-ledger retention, temporary-storage cap).
- Consequences baked into the plan: every issue has Depends-on / Scope / Files / Acceptance criteria / Non-goals; issues form a strict linear merge order; PRs must include real command output; PR descriptions list every file changed.

### 3.6 Open questions and gaps (resolve before or during the named issue)

- OPEN Q3: exact Sorokeep CLI surface for guard and per-entry storage-key tracking. Verify with live `--help` (Issue 7).
- OPEN Q4: admin account model. Default classic multisig G-account with medium threshold set deliberately. Smart-contract account only if a concrete custom-auth need appears. Mainnet admin setup is not decided.
- OPEN Q5: use the confirmed retention window of the chosen RPC provider for polling cadence and outage recovery (Issue 6).
- OPEN: which data source feeds the Operations page for TTL status and costs beyond webhook alerts (options: Sorokeep `--json` CLI output such as `sorokeep contracts --json`, reading Sorokeep's SQLite DB, or its MCP server; MCP is designed for AI agents, and a DB read couples deployments). Not decided (Issue 7/11).
- OPEN: whether the user is fine with Lumens Vault issues living in `TegoLabs/sorokeep`'s issue tracker (labeled `lumens-vault`, 50+ existing issues). Default in the script is yes. Confirm before running `create_issues.ps1`.
- OPEN (unverified): exact constructor-arg flag spelling for `stellar contract deploy … -- --admin … --min_lock_ledgers …` (underscore vs kebab). The backlog text uses kebab-case; verify with `stellar contract deploy … -- --help` (Issue 3).
- GAP found in final review, RECOMMENDED for Issue 2: the frontend must read lock bounds live from the contract (Issue 11), but the contract has NO config getter. Add a view such as `get_lock_bounds() -> (u32, u32)`. The existing `get_vault` already returns `unlock_ledger`. The GitHub issue text in `create_issues.ps1`/`ISSUE_BACKLOG.md` does not mention this getter; patch it before running.
- GAP, RECOMMENDED for Issue 2: `update_config` emits no event, so the backend cannot see config changes. Consider a `ConfigUpdatedEvent { #[topic] admin, min_lock_ledgers, max_lock_ledgers }`.
- GAP, RECOMMENDED for Issue 6: the frontend deposit form needs the current whitelisted-asset list, but the contract has only `is_whitelisted(asset)` (no enumeration). The backend must derive the current whitelist from `WhitelistEvent`/`DelistEvent` (asset is in event data, not a topic).
- OBSERVATION: `env.ledger().sequence() + lock_ledgers` and `current_count + 1` are unchecked u32 additions. The release profile has `overflow-checks = true` so they trap rather than wrap; consider `checked_add` returning an error.
- OBSERVATION: the constructor returns `()`. For Issue 2's min/max validation choose either `panic_with_error!` or a `Result<(), Error>` constructor. Verify by compiling against SDK 28; do not assume.
- Dropped or deferred from the original Stage-1 design (not currently in scope; revisit deliberately, do not silently re-add or forget): two-step withdrawal (deferred to v2), `TotalDeposits(asset)` counter, `RateLimit` temporary-storage entries, `sorokeep budget set` cap, MCP-based Operations page, per-user lock length bounds as separate per asset.
- Before any mainnet deployment (not yet issues): live testnet upgrade dry-run with two independent deployments; production admin multisig with verified medium threshold; verify emitted event topic counts; verify Sorokeep flags live; RECOMMENDED independent security review.
- After Wave 9: move `lumens-vault/` to its own repo (RECOMMENDED: preserve history via `git subtree split` or `filter-repo`), migrate issues, revisit README license section.

---

## 4. Database & Data Models (If applicable)

### 4.1 On-chain storage (current contract, VERIFIED by passing tests)

Instance storage (contract-wide TTL, extended on every entry point via helpers `get_admin`, `check_paused`, `check_whitelisted`):

- `DataKey::Admin` → `Address`
- `DataKey::Config` → `VaultConfig::V1(VaultConfigV1 { default_timelock_ledgers: u32 })` (**to become `{ min_lock_ledgers, max_lock_ledgers }` in Issue 2**)
- `DataKey::State` → `VaultState::V1(VaultStateV1 { is_paused: bool })`
- `DataKey::AssetWhitelist(Address)` → `bool` (one instance entry per asset; `remove_asset` stores `false`, it does not delete)

Persistent storage (per-entry TTL, extended on every touch):

- `DataKey::Vault(user: Address, asset: Address, vault_id: u32)` → `VaultEntry::V1(VaultEntryV1 { amount: i128, unlock_ledger: u32 })`
- `DataKey::UserVaultCount(Address)` → `u32` (last used vault id; new id = count + 1). Its TTL is now extended in `deposit` (previously a bug).

Temporary storage: not used in v1.

TTL constants: `DAY_IN_LEDGERS = 17280`; instance and persistent bump = 30 days (518,400), threshold = 14 days (241,920).

Versioning rule: every persisted struct is wrapped in a versioned enum. A future version adds a variant (`VaultEntry::V2`) and keeps V1 byte-identical. The fixture crate demonstrates this.

### 4.2 Contract interface (current)

- Constructor: `__constructor(env, admin: Address, default_timelock_ledgers: u32)` (calls `admin.require_auth()`).
- Admin: `pause`, `unpause`, `add_asset(asset)`, `remove_asset(asset)`, `transfer_admin(new_admin)`, `update_config(new_timelock_ledgers)`, `upgrade(new_wasm_hash: BytesN<32>)`. All read the admin from storage and call `admin.require_auth()`.
- Vault ops: `deposit(from, asset, amount) -> Result<u32, Error>` (**gains `lock_ledgers: u32` in Issue 2**), `withdraw(to, asset, vault_id, amount)`.
- Views: `version() -> u32`, `get_vault(user, asset, vault_id) -> VaultEntryV1`, `get_user_vault_count(user)`, `is_paused()`, `is_whitelisted(asset)`, `get_admin_address()`.
- Errors: `NotInitialized=1, Paused=2, AssetNotWhitelisted=3, InsufficientBalance=4, TimelockNotExpired=5, VaultNotFound=6, InvalidAmount=7`. Issue 2 appends `InvalidLockPeriod=8`. (`AlreadyInitialized` and the never-returned `Unauthorized` were removed earlier because nothing was deployed.)

### 4.3 Events (all `#[contractevent]`; topics ≤ 4)

| Event            | `#[topic]` fields | Data fields      |
| ---------------- | ----------------- | ---------------- |
| `PauseEvent`     | admin             | (none)           |
| `UnpauseEvent`   | admin             | (none)           |
| `WhitelistEvent` | admin             | asset            |
| `DelistEvent`    | admin             | asset            |
| `NewAdminEvent`  | admin             | new_admin        |
| `DepositEvent`   | from, asset       | vault_id, amount |
| `WithdrawEvent`  | to, asset         | vault_id, amount |
| `UpgradeEvent`   | admin             | new_wasm_hash    |

Note: `asset` in Whitelist/Delist events is data, so it cannot be used as an RPC topic filter; the backend must inspect payloads.

### 4.4 Backend SQLite model — NOT YET DESIGNED, RECOMMENDED sketch only (design it in Issues 6, 8, 9)

Suggested entities: `cursor` (contract_id, last_processed_ledger, last_cursor, updated_at); `events` (event_id PK for dedup, ledger, type, topics_json, data_json, ingested_at); `vaults` (PK user+asset+vault_id, balance, unlock_ledger, created_ledger, updated_ledger); `whitelist` (asset PK, is_whitelisted, updated_ledger); `admin_actions` (event_id PK, ledger, action_type, admin, payload_json, timestamp); `sorokeep_alerts` (id, contract_id, entry_key_xdr, entry_type, severity, configured_threshold, remaining_ledgers, fired_at_ledger, timestamp, raw_json, received_at); `price_cache` (asset PK, price, decimals, resolution, source_timestamp, fetched_at, status fresh|stale|deviant|unavailable).
Store `i128` amounts as TEXT or BigInt, never JS `number` (precision loss). Handle decimals per asset explicitly; do not assume XLM's decimals.
Rejected earlier design (do NOT use): Postgres `cursors`/`vaults`/`system_audit_log` compliance schema, Redis cache, a `/vaults/dormant` endpoint (duplicates Sorokeep), PagerDuty routing, reorg rollback tables.
Candidate read API (RECOMMENDED, non-binding): "my vaults" by address, recent admin activity, current whitelist, valuation, `POST` Sorokeep webhook receiver, health.
Sorokeep's own tables (`contracts`, `contract_entries`, `extension_policies`, `alert_configs`, `alerts_fired`, `extension_history`) belong to Sorokeep. Never write to them.

---

## 5. Step-by-Step Implementation Plan

### Agent operating rules (apply to every phase)

- Read `lumens-vault/docs/TECH_SPEC.md`, `SYSTEM_DESIGN.md` and (for Issue 5) `SCAFFOLD_BRIEF.md` first. The docs win over this handoff if they conflict; flag the conflict.
- One issue at a time, in order; each issue merges before the next starts. Work on a branch and open a PR. Do not push to main without the user's approval (RECOMMENDED safeguard).
- Before every commit: `git status`; confirm only `lumens-vault/**` changed; no `target/`; no nested `.git`.
- PR description lists every file changed and includes real command output for every verification asked for in the acceptance criteria.

### Phase 0 — Repo hygiene and doc placement (before Issue 1)

Run from `C:\Users\HP\code\sorokeep` (PowerShell), each step guarded by an existence check:

1. Ensure `lumens-vault\` exists and the contracts live at `lumens-vault\contracts\{lumens-vault, lumens-vault-v2-fixture}`. If a root `contracts\` still exists, `Move-Item contracts lumens-vault\contracts`. `test.rs`'s relative path `../lumens-vault-v2-fixture/...` keeps working because the two crates stay siblings.
2. Delete `lumens-vault\contracts\lumens-vault\.git` (empty nested repo) and any obsolete "fixes" `README.md` inside `contracts\lumens-vault\`.
3. Add `.gitignore` containing `target/` to `lumens-vault\contracts\lumens-vault-v2-fixture\`. Confirm the main crate's `.gitignore` ignores `target/`.
4. Place docs: `lumens-vault\README.md`, `lumens-vault\CONTRIBUTING.md`; `lumens-vault\docs\TECH_SPEC.md`, `SYSTEM_DESIGN.md`, `SCAFFOLD_BRIEF.md`; `ISSUE_BACKLOG.md` and `create_issues.ps1` (for example under `lumens-vault\docs\` or `lumens-vault\scripts\`; the user has them downloaded, and if missing they must be regenerated from §5 and §6).
5. Text fixes: README "Stellar Community Fund's Drips Wave 9" → "Drips Wave 9 (Stellar)"; remove stale first-person comments and the obsolete "I could not run any of this" banner (keep technical content); change `[dev_dependencies]` → `[dev-dependencies]` in the main crate `Cargo.toml`.
6. Patch `ISSUE_BACKLOG.md` and `create_issues.ps1` with the gaps in §3.6 (Issue 2 getter and optional `ConfigUpdatedEvent`; Issue 6 whitelist derivation; Issue 3 flag-spelling verification) before creating issues.
7. Verify: in the main crate run `cargo test` (expect 5 pass) and `stellar contract build` (must produce a wasm; confirms `[profile.release]` has `overflow-checks = true`). In the fixture run `stellar contract build`.
8. Commit on a branch (agent performs; see rules). Then, only after the user confirms the tracker question, run `create_issues.ps1` (needs `gh auth login`; label `lumens-vault`; 3 milestones LV1/LV2/LV3; issue titles prefixed `1.`–`11.`; each issue's "Depends on" holds the real captured GitHub number of its predecessor).

### The 11 issues (strict linear order; issue N merges before N+1)

Repo target: `TegoLabs/sorokeep`, label `lumens-vault`. Not every dependency is technical; Issue 10 is honestly labeled as parallelizable.

**Issue 1 — Fix flaky `test_real_upgrade_and_state_migration`** (Depends: none; owner Claude Code)

- Scope: one test file, one line.
- Files: `lumens-vault/contracts/lumens-vault/src/test.rs` (edit).
- AC: add `env.ledger().with_mut(|l| l.sequence_number = 100_000);` right after `env.mock_all_auths();` in that test; run `cargo test` ≥ 5 consecutive times, all pass; PR states the number of consecutive passing runs.
- Non-goals: touch no other test.

**Issue 2 — Restore per-deposit lock period selection (7/30/90 days)** (Depends: Issue 1)

- Scope: contract only. Changes config shape, `deposit` signature, `__constructor` signature, adds an error.
- Files: `src/storage.rs` (`VaultConfigV1` → `min_lock_ledgers`, `max_lock_ledgers`, removing `default_timelock_ledgers`), `src/contract.rs` (`deposit(env, from, asset, amount, lock_ledgers)` validates range and computes `unlock_ledger = sequence + lock_ledgers`; `__constructor(env, admin, min_lock_ledgers, max_lock_ledgers)` validates `0 < min <= max`; `update_config(min, max)` validates the same; new `Error::InvalidLockPeriod = 8`; add a lock-bounds view getter; optionally `ConfigUpdatedEvent`), `src/events.rs` (only if the event is added), `src/test.rs` (update every existing `register`/`deposit` call site; add boundary tests). All under `lumens-vault/contracts/lumens-vault/`.
- AC: deposit rejects outside `[min,max]` with `InvalidLockPeriod`; constructor validates; `update_config` sets min/max; tests for min boundary ok, max boundary ok, below min fails, above max fails; nothing still calls the old signatures; the lock-bounds getter exists and is tested. Standing verifications: `cargo test` green, `stellar contract build` succeeds. NOTE: the fixture's `VaultConfigV1` must stay byte-compatible if the upgrade test still reads config. Re-check that `test_real_upgrade_and_state_migration` still passes; update the fixture's config struct to match if needed.
- Non-goals: no frontend picker (Issue 11); no per-asset bounds.

**Issue 3 — Update deploy scripts and docs for constructor-based init** (Depends: Issue 2)

- Scope: tooling and docs only; no contract code.
- Files: `lumens-vault/scripts/deploy.ps1` (user is on PowerShell; a `.sh` twin is optional) and `lumens-vault/docs/deploy.md` (new).
- AC: deploy script passes `admin`, `min_lock_ledgers`, `max_lock_ledgers` as constructor args at deploy time (no separate `initialize` call); flag spelling verified with `--help`; `deploy.md` documents the exact fresh-testnet sequence; if admin differs from the deployer, the doc shows how to produce a transaction carrying both parties' authorizations (constructor calls `admin.require_auth()`); secrets referenced by env var only.
- Non-goals: not deciding the mainnet admin/multisig setup.

**Issue 4 — Expand contract test coverage to every `Error` variant and admin function** (Depends: Issue 3)

- Files: `lumens-vault/contracts/lumens-vault/src/test.rs` (edit).
- AC: deposit/withdraw fail with `Paused` when paused and succeed after `unpause`; deposit fails with `AssetNotWhitelisted` for a non-whitelisted asset; after `remove_asset` existing deposits are still withdrawable (permanent regression test); `transfer_admin` succeeds and the previous admin's later admin calls are verified to actually fail (assert what really happens; do not assume); `update_config` changes bounds and a later deposit validates against the new ones; every `Error` variant (including `InvalidLockPeriod`) is triggered by at least one test; add the test that prints/asserts `env.events().all()` topic counts per event type (NFR-3).
- Non-goals: no fuzz/property tests.

**Issue 5 — Scaffold backend and frontend folder structure** (Depends: Issue 4; owner Gemini, reviewed)

- Scope: exactly `SCAFFOLD_BRIEF.md`. Zero business logic, zero real UI. Hold Gemini until Issue 4 is merged (contract frozen before off-chain work).
- Files created: entire `lumens-vault/backend/` and `lumens-vault/frontend/` trees (see §6.5).
- AC: folder tree matches exactly; `npm install && npm run build` succeeds in `backend/`; `npm install && npm run dev` starts the frontend; grep shows no function body longer than a `throw` or `TODO`; `git status` shows nothing outside `lumens-vault/`; PR description lists every file created.
- Non-goals: no logic, no wallet code, no real UI, no monorepo tooling, no modification of `contracts/`.

**Issue 6 — Minimal events-reader (deposit/withdraw/admin-action history)** (Depends: Issue 5)

- Files (stub → real): `backend/src/adapters/soroban-rpc/index.ts`, `adapters/sqlite/index.ts`, `domain/vault-state.ts`, `domain/alert-correlation.ts`, `api/index.ts` (endpoints), `backend/test/` (real tests).
- AC: poll `getEvents`, dedup by event id (overlapping windows/retries, not reorgs); confirm the chosen RPC provider's actual retention window and design cadence and outage recovery against it; reconstruct per-user (asset, vault_id), balance, unlock ledger and cross-check a sample against the contract's `get_vault`; detect and store pause/unpause/upgrade/new_admin/whitelist/delist (and config updates if the event exists); derive the current whitelist from Whitelist/Delist events; read API for "my vaults" and "recent admin activity" (and whitelist).
- Non-goals: no PagerDuty, no Postgres/Redis, no audit-log guarantees, no reorg rollback.

**Issue 7 — Register the contract with Sorokeep and configure a guard policy** (Depends: Issue 3)

- Files: `lumens-vault/docs/sorokeep-setup.md` (new).
- AC: `sorokeep watch <contract-id> --network testnet --name "Lumens Vault"` run against the deployed contract; guard policy configured with flags verified against `sorokeep guard --help` (conservative-leaning preset because the contract will hold real funds; keypair via env var only); document whether `--storage-keys` can track individual `Vault(user, asset, id)` entries and wire it if so (this is the "many persistent entries" showcase); record the exact commands; also confirm the OPEN assumption that Sorokeep does not consume application events, and decide the Operations-page data source.
- Non-goals: no custom TTL monitoring or auto-extension code.

**Issue 8 — Webhook receiver for Sorokeep alerts** (Depends: Issues 6 and 7)

- Files: `backend/src/adapters/sorokeep-webhook/index.ts` (stub → real), `backend/src/api/index.ts` (endpoint), `backend/test/`.
- AC: `sorokeep` installed as an npm dependency; endpoint verifies via `verifyWebhookSignature` and rejects anything that fails; verified alerts stored in the SAME SQLite store Issue 6 created (timeline fields: contract, entry, threshold, timestamp); `sorokeep alerts add … --type webhook --url <endpoint>` configured with verified flags.
- Non-goals: no retry/replay for missed webhooks.

**Issue 9 — Reflector (SEP-40) client for USD valuation, off-chain only** (Depends: Issue 6)

- Files: `backend/src/adapters/reflector/index.ts`, `backend/src/domain/valuation.ts`, `backend/test/`.
- AC: read `lastprice`/`decimals`/`resolution` by simulation only; verify current testnet and mainnet Reflector contract IDs against Reflector's official docs and stellar.expert (no hardcoded remembered IDs); staleness guard and deviation guard implemented and tested (fresh, stale, deviant cases); a clear "unavailable" state (or a documented TWAP fallback) when guards trip or an asset is not priced; decimals handled explicitly per whitelisted asset.
- Non-goals: no on-chain price reads; no multi-oracle aggregation; no liquidation/collateral logic.

**Issue 10 — Wireframes and mockups** (Depends: none technically; placed here for linear order; owner Claude chat via the Design artifact type)

- Files: `lumens-vault/docs/wireframes.md` (pointer/summary and key decisions).
- AC: core views specified: Dashboard, Deposit flow (with lock-period picker), My Vaults, Operations page, plus states for stale/unavailable price and Archival/Restore situations; explicit user approval before Issue 11 starts.
- Non-goals: no implementation code. May start earlier in parallel.

**Issue 11 — Next.js frontend implementation** (Depends: Issue 10 approved, and Issues 6, 8, 9)

- Files: `frontend/app/page.tsx`, `deposit/page.tsx`, `vaults/page.tsx`, `operations/page.tsx`, plus Freighter integration under `frontend/lib/`.
- AC: Freighter connection works; lock-period picker reads live min/max from the contract (not hardcoded); operations page shows genuinely real Sorokeep and alert data (not mocked); dashboard USD total visibly shows staleness/deviation states when guards trip.
- Non-goals: do not start before Issue 10 is approved.

---

## 6. Code Drafts & Snippets Reference

Only final agreed versions are included. Long explanatory header comments in the on-disk files are omitted here; the logic is exact.

### 6.1 `lumens-vault/contracts/lumens-vault/src/lib.rs`

```rust
#![no_std]

pub mod storage;
pub mod events;
pub mod contract;

pub use contract::{LumensVault, LumensVaultClient};

#[cfg(test)]
mod test;
```

### 6.2 `.../src/storage.rs` (to change in Issue 2: `VaultConfigV1`)

```rust
use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    State,                         // Stores VaultState
    Config,                        // Stores VaultConfig
    Vault(Address, Address, u32),  // (User, Asset, Vault ID) -> Stores VaultEntry
    AssetWhitelist(Address),       // Stores bool
    UserVaultCount(Address),       // Stores u32 for auto-incrementing vault IDs
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultConfig {
    V1(VaultConfigV1),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultConfigV1 {
    pub default_timelock_ledgers: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultEntry {
    V1(VaultEntryV1),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultEntryV1 {
    pub amount: i128,
    pub unlock_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultState {
    V1(VaultStateV1),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultStateV1 {
    pub is_paused: bool,
}
```

### 6.3 `.../src/events.rs`

```rust
use soroban_sdk::{contractevent, Address, BytesN};

#[contractevent]
pub struct PauseEvent {
    #[topic]
    pub admin: Address,
}

#[contractevent]
pub struct UnpauseEvent {
    #[topic]
    pub admin: Address,
}

#[contractevent]
pub struct WhitelistEvent {
    #[topic]
    pub admin: Address,
    pub asset: Address,
}

#[contractevent]
pub struct DelistEvent {
    #[topic]
    pub admin: Address,
    pub asset: Address,
}

#[contractevent]
pub struct NewAdminEvent {
    #[topic]
    pub admin: Address,
    pub new_admin: Address,
}

#[contractevent]
pub struct DepositEvent {
    #[topic]
    pub from: Address,
    #[topic]
    pub asset: Address,
    pub vault_id: u32,
    pub amount: i128,
}

#[contractevent]
pub struct WithdrawEvent {
    #[topic]
    pub to: Address,
    #[topic]
    pub asset: Address,
    pub vault_id: u32,
    pub amount: i128,
}

#[contractevent]
pub struct UpgradeEvent {
    #[topic]
    pub admin: Address,
    pub new_wasm_hash: BytesN<32>,
}
```

### 6.4 `.../src/contract.rs` (current, passing; Issue 2 modifies constructor, `deposit`, `update_config`, `Error`)

```rust
use soroban_sdk::{contract, contracterror, contractimpl, token, Address, BytesN, Env};

use crate::events::*;
use crate::storage::{
    DataKey, VaultConfig, VaultConfigV1, VaultEntry, VaultEntryV1, VaultState, VaultStateV1,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotInitialized = 1,
    Paused = 2,
    AssetNotWhitelisted = 3,
    InsufficientBalance = 4,
    TimelockNotExpired = 5,
    VaultNotFound = 6,
    InvalidAmount = 7,
}

const DAY_IN_LEDGERS: u32 = 17280; // 86,400s / 5s-per-ledger

const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = 14 * DAY_IN_LEDGERS;

const PERSISTENT_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = 14 * DAY_IN_LEDGERS;

/// Compile-time constant identifying the running bytecode. Bump on each upgrade.
pub const VERSION: u32 = 1;

#[contract]
pub struct LumensVault;

#[contractimpl]
impl LumensVault {
    /// Runs atomically as part of deployment; cannot be called again.
    pub fn __constructor(env: Env, admin: Address, default_timelock_ledgers: u32) {
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);

        let config = VaultConfig::V1(VaultConfigV1 {
            default_timelock_ledgers,
        });
        env.storage().instance().set(&DataKey::Config, &config);

        let state = VaultState::V1(VaultStateV1 { is_paused: false });
        env.storage().instance().set(&DataKey::State, &state);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    pub fn version(_env: Env) -> u32 {
        VERSION
    }

    // --- Admin ---

    pub fn pause(env: Env) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        let state = VaultState::V1(VaultStateV1 { is_paused: true });
        env.storage().instance().set(&DataKey::State, &state);

        PauseEvent { admin: admin.clone() }.publish(&env);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        let state = VaultState::V1(VaultStateV1 { is_paused: false });
        env.storage().instance().set(&DataKey::State, &state);

        UnpauseEvent { admin: admin.clone() }.publish(&env);
        Ok(())
    }

    pub fn add_asset(env: Env, asset: Address) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::AssetWhitelist(asset.clone()), &true);
        WhitelistEvent { admin: admin.clone(), asset: asset.clone() }.publish(&env);
        Ok(())
    }

    pub fn remove_asset(env: Env, asset: Address) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::AssetWhitelist(asset.clone()), &false);
        DelistEvent { admin: admin.clone(), asset: asset.clone() }.publish(&env);
        Ok(())
    }

    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        NewAdminEvent { admin: admin.clone(), new_admin: new_admin.clone() }.publish(&env);
        Ok(())
    }

    pub fn update_config(env: Env, new_timelock_ledgers: u32) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        let config = VaultConfig::V1(VaultConfigV1 {
            default_timelock_ledgers: new_timelock_ledgers,
        });
        env.storage().instance().set(&DataKey::Config, &config);
        Ok(())
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        let admin = Self::get_admin(&env)?;
        admin.require_auth();

        env.deployer()
            .update_current_contract(soroban_sdk::ContractExecutable::Wasm(new_wasm_hash.clone()));

        UpgradeEvent { admin: admin.clone(), new_wasm_hash: new_wasm_hash.clone() }.publish(&env);
        Ok(())
    }

    // --- Vault operations ---

    pub fn deposit(env: Env, from: Address, asset: Address, amount: i128) -> Result<u32, Error> {
        from.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        Self::check_paused(&env)?;
        Self::check_whitelisted(&env, &asset)?;

        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        let vault_count_key = DataKey::UserVaultCount(from.clone());
        let current_count: u32 = env.storage().persistent().get(&vault_count_key).unwrap_or(0);
        let new_vault_id = current_count + 1;
        env.storage().persistent().set(&vault_count_key, &new_vault_id);
        // Keeps the per-user counter alive (it was previously never extended).
        env.storage().persistent().extend_ttl(
            &vault_count_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let config = Self::get_config(&env)?;
        let unlock_ledger = env.ledger().sequence() + config.default_timelock_ledgers;

        let vault_entry = VaultEntry::V1(VaultEntryV1 { amount, unlock_ledger });

        let vault_key = DataKey::Vault(from.clone(), asset.clone(), new_vault_id);
        env.storage().persistent().set(&vault_key, &vault_entry);
        env.storage().persistent().extend_ttl(
            &vault_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        DepositEvent {
            from: from.clone(),
            asset: asset.clone(),
            vault_id: new_vault_id,
            amount,
        }
        .publish(&env);

        Ok(new_vault_id)
    }

    pub fn withdraw(
        env: Env,
        to: Address,
        asset: Address,
        vault_id: u32,
        amount: i128,
    ) -> Result<(), Error> {
        to.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        Self::check_paused(&env)?;
        // Deliberately no whitelist check: a delisted asset must never trap funds.

        let vault_key = DataKey::Vault(to.clone(), asset.clone(), vault_id);
        let vault_entry: VaultEntry = env
            .storage()
            .persistent()
            .get(&vault_key)
            .ok_or(Error::VaultNotFound)?;
        env.storage().persistent().extend_ttl(
            &vault_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let mut entry_v1 = match vault_entry {
            VaultEntry::V1(e) => e,
        };

        if entry_v1.amount < amount {
            return Err(Error::InsufficientBalance);
        }

        if env.ledger().sequence() < entry_v1.unlock_ledger {
            return Err(Error::TimelockNotExpired);
        }

        entry_v1.amount -= amount;
        env.storage()
            .persistent()
            .set(&vault_key, &VaultEntry::V1(entry_v1));

        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        WithdrawEvent {
            to: to.clone(),
            asset: asset.clone(),
            vault_id,
            amount,
        }
        .publish(&env);

        Ok(())
    }

    // --- Views ---

    pub fn get_vault(
        env: Env,
        user: Address,
        asset: Address,
        vault_id: u32,
    ) -> Result<VaultEntryV1, Error> {
        let vault_key = DataKey::Vault(user, asset, vault_id);
        let entry: VaultEntry = env
            .storage()
            .persistent()
            .get(&vault_key)
            .ok_or(Error::VaultNotFound)?;
        match entry {
            VaultEntry::V1(e) => Ok(e),
        }
    }

    pub fn get_user_vault_count(env: Env, user: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::UserVaultCount(user))
            .unwrap_or(0)
    }

    pub fn is_paused(env: Env) -> Result<bool, Error> {
        let state: VaultState = env
            .storage()
            .instance()
            .get(&DataKey::State)
            .ok_or(Error::NotInitialized)?;
        match state {
            VaultState::V1(s) => Ok(s.is_paused),
        }
    }

    pub fn is_whitelisted(env: Env, asset: Address) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::AssetWhitelist(asset))
            .unwrap_or(false)
    }

    pub fn get_admin_address(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    // --- Internal helpers (each extends instance TTL) ---

    fn get_admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn get_config(env: &Env) -> Result<VaultConfigV1, Error> {
        let config: VaultConfig = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)?;
        match config {
            VaultConfig::V1(c) => Ok(c),
        }
    }

    fn check_paused(env: &Env) -> Result<(), Error> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        let state: VaultState = env
            .storage()
            .instance()
            .get(&DataKey::State)
            .ok_or(Error::NotInitialized)?;
        match state {
            VaultState::V1(s) => {
                if s.is_paused {
                    return Err(Error::Paused);
                }
            }
        }
        Ok(())
    }

    fn check_whitelisted(env: &Env, asset: &Address) -> Result<(), Error> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        let is_whitelisted = env
            .storage()
            .instance()
            .get(&DataKey::AssetWhitelist(asset.clone()))
            .unwrap_or(false);
        if !is_whitelisted {
            return Err(Error::AssetNotWhitelisted);
        }
        Ok(())
    }
}
```

### 6.5 `.../src/test.rs` (current state, 5 tests passing; includes the user's import fix `storage::Persistent`; Issue 1 adds the ledger-pin line, Issues 2 and 4 extend it)

```rust
#![cfg(test)]
#![allow(deprecated)]

use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{
    testutils::{storage::Persistent, Address as _, Ledger},
    Address, BytesN, Env,
};

use crate::storage::DataKey;
use crate::{LumensVault, LumensVaultClient};

fn create_token_contract<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
    let contract_address = env.register_stellar_asset_contract_v2(admin.clone());
    (
        TokenClient::new(env, &contract_address.address()),
        StellarAssetClient::new(env, &contract_address.address()),
    )
}

/// `env.register` takes constructor args directly (constructor replaced `initialize`).
fn setup(env: &Env, admin: &Address, default_timelock_ledgers: u32) -> LumensVaultClient<'static> {
    let vault_id = env.register(LumensVault, (admin, default_timelock_ledgers));
    LumensVaultClient::new(env, &vault_id)
}

#[test]
fn test_deposit_and_withdraw() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let vault_client = setup(&env, &admin, 10);

    let token_admin = Address::generate(&env);
    let (token_client, token_asset) = create_token_contract(&env, &token_admin);
    token_asset.mint(&user, &1000);

    vault_client.add_asset(&token_client.address);

    let returned_vault_id = vault_client.deposit(&user, &token_client.address, &100);
    assert_eq!(returned_vault_id, 1);

    assert_eq!(token_client.balance(&user), 900);
    assert_eq!(token_client.balance(&vault_client.address), 100);

    // Timelock not yet expired.
    let res = vault_client.try_withdraw(&user, &token_client.address, &1, &50);
    assert!(res.is_err());

    env.ledger().with_mut(|l| l.sequence_number += 11);

    vault_client.withdraw(&user, &token_client.address, &1, &50);

    assert_eq!(token_client.balance(&user), 950);
    assert_eq!(token_client.balance(&vault_client.address), 50);

    let entry = vault_client.get_vault(&user, &token_client.address, &1);
    assert_eq!(entry.amount, 50);
}

#[test]
fn test_deposit_rejects_non_positive_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let vault_client = setup(&env, &admin, 10);

    let token_admin = Address::generate(&env);
    let (token_client, token_asset) = create_token_contract(&env, &token_admin);
    token_asset.mint(&user, &1000);
    vault_client.add_asset(&token_client.address);

    let zero_res = vault_client.try_deposit(&user, &token_client.address, &0);
    assert!(zero_res.is_err());

    let negative_res = vault_client.try_deposit(&user, &token_client.address, &-100);
    assert!(negative_res.is_err());
}

#[test]
fn test_withdraw_rejects_non_positive_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let vault_client = setup(&env, &admin, 10);

    let token_admin = Address::generate(&env);
    let (token_client, token_asset) = create_token_contract(&env, &token_admin);
    token_asset.mint(&user, &1000);
    vault_client.add_asset(&token_client.address);

    vault_client.deposit(&user, &token_client.address, &500);
    env.ledger().with_mut(|l| l.sequence_number += 11);

    let res = vault_client.try_withdraw(&user, &token_client.address, &1, &-200);
    assert!(res.is_err());

    // Balance must be exactly what was deposited, not inflated.
    let entry = vault_client.get_vault(&user, &token_client.address, &1);
    assert_eq!(entry.amount, 500);
}

#[test]
fn test_user_vault_count_ttl_is_extended_on_deposit() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let vault_client = setup(&env, &admin, 10);

    let token_admin = Address::generate(&env);
    let (token_client, token_asset) = create_token_contract(&env, &token_admin);
    token_asset.mint(&user, &1000);
    vault_client.add_asset(&token_client.address);

    vault_client.deposit(&user, &token_client.address, &100);

    let count_key = DataKey::UserVaultCount(user.clone());
    let ttl_after_first_deposit =
        env.as_contract(&vault_client.address, || env.storage().persistent().get_ttl(&count_key));

    env.ledger()
        .with_mut(|l| l.sequence_number += ttl_after_first_deposit - 1000);

    vault_client.deposit(&user, &token_client.address, &50);

    let ttl_after_second_deposit =
        env.as_contract(&vault_client.address, || env.storage().persistent().get_ttl(&count_key));

    assert!(
        ttl_after_second_deposit > 1000,
        "UserVaultCount TTL was not refreshed on the second deposit"
    );
}

// Real cross-binary upgrade test (Stellar-documented pattern). Requires the fixture to be
// compiled FIRST because `contractimport!` reads the .wasm at compile time:
//   cd ../lumens-vault-v2-fixture && stellar contract build && cd ../lumens-vault && cargo test
mod new_contract {
    soroban_sdk::contractimport!(
        file = "../lumens-vault-v2-fixture/target/wasm32v1-none/release/lumens_vault_v2_fixture.wasm"
    );
}

fn install_new_wasm(env: &Env) -> BytesN<32> {
    env.deployer().upload_contract_wasm(new_contract::WASM)
}

#[test]
fn test_real_upgrade_and_state_migration() {
    let env = Env::default();
    env.mock_all_auths();
    // ISSUE 1 adds here:  env.ledger().with_mut(|l| l.sequence_number = 100_000);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let vault_client = setup(&env, &admin, 10);

    let token_admin = Address::generate(&env);
    let (token_client, token_asset) = create_token_contract(&env, &token_admin);
    token_asset.mint(&user, &1000);
    vault_client.add_asset(&token_client.address);

    // 1. Write real state through the OLD contract.
    let returned_vault_id = vault_client.deposit(&user, &token_client.address, &500);
    assert_eq!(returned_vault_id, 1);
    assert_eq!(vault_client.version(), 1);

    // 2. Install a second, genuinely different binary and upgrade the SAME address.
    let new_wasm_hash = install_new_wasm(&env);
    vault_client.upgrade(&new_wasm_hash);

    // 3. Running bytecode really changed.
    assert_eq!(vault_client.version(), 2);

    // 4. Pre-upgrade V1 data readable through the NEW binary's own code, migrated to V2 shape.
    let new_client = new_contract::Client::new(&env, &vault_client.address);
    let migrated = new_client.get_vault(&user, &token_client.address, &1);

    assert_eq!(migrated.amount, 500);
    assert!(migrated.last_touched_ledger > 0);
}
```

### 6.6 `lumens-vault/contracts/lumens-vault-v2-fixture/` (disposable; proves upgrade; never deployed)

`Cargo.toml` (final, includes the profile block `stellar contract build` requires):

```toml
[package]
name = "lumens-vault-v2-fixture"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]
doctest = false

[dependencies]
soroban-sdk = "28"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

`.gitignore`:

```
target/
```

`src/lib.rs`:

```rust
#![no_std]

pub mod storage;
pub mod contract;

pub use contract::{LumensVault, LumensVaultClient};
```

`src/storage.rs` (keys and V1 shapes must stay byte-identical to the real contract's; only add variants):

```rust
use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    State,
    Config,
    Vault(Address, Address, u32),
    AssetWhitelist(Address),
    UserVaultCount(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultConfig {
    V1(VaultConfigV1),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultConfigV1 {
    pub default_timelock_ledgers: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultEntry {
    V1(VaultEntryV1),
    V2(VaultEntryV2),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultEntryV1 {
    pub amount: i128,
    pub unlock_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultEntryV2 {
    pub amount: i128,
    pub unlock_ledger: u32,
    pub last_touched_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VaultState {
    V1(VaultStateV1),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultStateV1 {
    pub is_paused: bool,
}
```

`src/contract.rs`:

```rust
use soroban_sdk::{contract, contracterror, contractimpl, Address, Env};

use crate::storage::{DataKey, VaultEntry, VaultEntryV2};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    VaultNotFound = 1,
}

pub const VERSION: u32 = 2;

#[contract]
pub struct LumensVault;

#[contractimpl]
impl LumensVault {
    pub fn version(_env: Env) -> u32 {
        VERSION
    }

    pub fn get_vault(
        env: Env,
        user: Address,
        asset: Address,
        vault_id: u32,
    ) -> Result<VaultEntryV2, Error> {
        let key = DataKey::Vault(user, asset, vault_id);
        let stored: VaultEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::VaultNotFound)?;

        let migrated = match stored {
            VaultEntry::V1(e) => VaultEntryV2 {
                amount: e.amount,
                unlock_ledger: e.unlock_ledger,
                last_touched_ledger: env.ledger().sequence(),
            },
            VaultEntry::V2(e) => e,
        };

        Ok(migrated)
    }
}
```

Build order for the upgrade test (PowerShell):

```powershell
cd lumens-vault\contracts\lumens-vault-v2-fixture
stellar contract build
cd ..\lumens-vault
cargo test
```

If the fixture's config struct must change to stay compatible after Issue 2 (config shape change), update it there too.

### 6.7 Scaffold specification for Issue 5 (from `SCAFFOLD_BRIEF.md`)

Backend tree (TypeScript/Node; `package.json` dependencies: `sorokeep`, `@stellar/stellar-sdk`, `better-sqlite3`, `express`, dev: `vitest`, `typescript`; no root workspace tool):

```
backend/
├── src/
│   ├── domain/{vault-state.ts, alert-correlation.ts, valuation.ts}   # signatures only; bodies throw "not implemented" + TODO naming the issue
│   ├── ports/{event-source.ts, price-oracle.ts, alert-sink.ts, persistence.ts}  # REAL complete interfaces: IEventSource, IPriceOracle, IAlertSink, IVaultRepository
│   ├── adapters/{soroban-rpc/index.ts, reflector/index.ts, sorokeep-webhook/index.ts, sqlite/index.ts}  # classes implementing ports, stubbed
│   └── api/index.ts                                                   # HTTP bootstrap, no real routes
├── test/                                                              # one placeholder/pending test file per module
├── package.json  tsconfig.json  .gitignore
```

Frontend tree (`create-next-app` defaults, TypeScript, app router; placeholder headings only, no wallet code, no API calls, no styling decisions):

```
frontend/
├── app/{page.tsx, deposit/page.tsx, vaults/page.tsx, operations/page.tsx}
├── package.json  tsconfig.json  next.config.ts
```

Ports are the one place real content matters. Suggested (non-binding) shapes derived from SYSTEM_DESIGN §1.3: `IEventSource` (fetch events from a cursor, returning events, next cursor, latest and oldest ledger), `IPriceOracle` (price, decimals, source timestamp per asset), `IAlertSink` (notify an admin-action or system alert), `IVaultRepository` (idempotent event save, cursor get/set, upsert vault, query vaults by user, whitelist state, admin actions, Sorokeep alerts, price cache).
Definition of done is the Issue 5 acceptance list in §5.

### 6.8 Gemini prompt (for Issue 5 only; use AFTER Issue 4 merges)

```
You're scaffolding the initial folder structure for a project called Lumens Vault,
which lives at lumens-vault/ in this repo.

Before doing anything, read these three files in full, in this order:
1. lumens-vault/docs/TECH_SPEC.md
2. lumens-vault/docs/SYSTEM_DESIGN.md
3. lumens-vault/docs/SCAFFOLD_BRIEF.md

Your task is exactly and only what SCAFFOLD_BRIEF.md describes. That document
is intentionally strict, and the constraints in it are not suggestions:

- No business logic anywhere. Every non-trivial function is a stub that throws
  "not implemented" with a comment pointing to the issue that will implement it.
- No features, dependencies, files, or folders beyond what's explicitly listed.
- Do not touch anything outside lumens-vault/ — not sorokeep's own src/, docs/,
  README, or anything else at the repo root.
- Do not modify lumens-vault/contracts/ at all. Both crates in there are
  finished and out of scope.
- No real frontend UI beyond bare placeholder routes — frontend work is
  blocked on a separate design-approval step that hasn't happened yet.

If you think something is missing from the brief, or find a reason to deviate
from it, stop and tell me what and why instead of deciding on your own and
building it. This project has specific, real history of scope drifting during
scaffolding, and that's exactly what this instruction is here to prevent.

When you're done, show me a diff or file list before I review it against
SCAFFOLD_BRIEF.md's Definition of Done checklist — don't tell me it's done,
show me what you built so I can check it myself.
```

### 6.9 `create_issues.ps1` mechanics (final logic; the full script also holds the 11 issue bodies from §5)

```powershell
$ErrorActionPreference = "Continue"
$Repo  = "TegoLabs/sorokeep"
$Label = "lumens-vault"

gh auth status
if ($LASTEXITCODE -ne 0) { Write-Host "Run 'gh auth login' first." -ForegroundColor Red; exit 1 }

gh label create $Label --repo $Repo --color "5319E7" --description "Lumens Vault work, tracked here until it gets its own repo" 2>$null

$Milestones = @("LV1 - Contract Hardening and Lock Periods","LV2 - Scaffold and Backend","LV3 - Design and Frontend")
foreach ($m in $Milestones) { gh api "repos/$Repo/milestones" -f title="$m" 2>$null | Out-Null }

function New-LumensIssue {
    param([string]$Title,[string]$Body,[string]$Milestone,[string[]]$ExtraLabels)
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $Body -Encoding utf8
    $labelArg = (@($Label) + $ExtraLabels) -join ","
    $result = gh issue create --repo $Repo --title "$Title" --body-file "$tmp" --label "$labelArg" --milestone "$Milestone"
    Remove-Item $tmp -Force
    if ($result -match '/issues/(\d+)\s*$') { return $Matches[1] } else { return $null }
}

# Each issue is created in order; later bodies interpolate the captured number of their
# predecessor, e.g.  $dep1 = if ($n1) { "#$n1" } else { "the flaky-test-fix issue" }
# Bodies that interpolate variables use double-quoted here-strings @" ... "@ (avoid literal $ in text);
# bodies without dependencies use single-quoted @' ... '@.
$n1 = New-LumensIssue -Milestone $Milestones[0] -ExtraLabels @("bug","good-first-issue","contract") `
    -Title "1. Fix flaky test_real_upgrade_and_state_migration" -Body @'
(body per §5, Issue 1)
'@
# ... Issues 2-11 follow the same pattern, each Depends-on line using the captured predecessor number(s):
#   2 -> #n1 ; 3 -> #n2 ; 4 -> #n3 ; 5 -> #n4 ; 6 -> #n5 ; 7 -> #n3 ; 8 -> #n6 and #n7 ; 9 -> #n6 ; 10 -> none ; 11 -> #n10, #n6, #n7, #n9
# Milestones: issues 1-4 -> LV1 ; 5-9 -> LV2 ; 10-11 -> LV3.
# Labels: 2 contract,breaking-change ; 3 devops,breaking-change ; 4 contract,testing ; 5 backend,frontend,scaffolding ;
#         6 backend ; 7 sorokeep-integration,devops ; 8 sorokeep-integration,backend ; 9 backend ; 10 design,blocked ; 11 frontend
```
