# Lumens Vault: creates the linear 11-issue backlog via GitHub CLI.
# GENERATED from one data source together with ISSUE_BACKLOG.md, so the two cannot drift.
#
# Real cross-links: each issue's "Depends on" holds the actual issue number GitHub assigned to
# its predecessor, captured at creation time (sorokeep already has 50+ issues; these will not be #1-11).
#
# BEFORE RUNNING
#   1. Install GitHub CLI (https://cli.github.com) and run `gh auth login`.
#   2. Confirm $Repo. Confirm you are fine with these issues living in that repo's tracker.
#   3. Push the lumens-vault/ folder first so the file paths named in the issues exist.
# NOTE: this script was written but NOT executed by its author (no PowerShell/gh in the authoring
# environment). Run it once, read the output, and fix anything it reports.

$ErrorActionPreference = "Continue"
$Repo  = "TegoLabs/sorokeep"
$Label = "lumens-vault"

gh auth status
if ($LASTEXITCODE -ne 0) { Write-Host "gh is not authenticated. Run 'gh auth login' first." -ForegroundColor Red; exit 1 }

# gh issue create FAILS if a label does not exist, so create them all first (errors = already exists, fine).
$AllLabels = @("lumens-vault","bug","good first issue","contract","breaking-change","devops","testing","backend","frontend","scaffolding","sorokeep-integration","design")
foreach ($l in $AllLabels) { gh label create "$l" --repo $Repo 2>$null | Out-Null }

$Milestones = @("LV1 - Contract Hardening and Lock Periods",
    "LV2 - Scaffold and Backend",
    "LV3 - Design and Frontend")
foreach ($m in $Milestones) { gh api "repos/$Repo/milestones" -f title="$m" 2>$null | Out-Null }

function Ref($n, $fallback) { if ($n) { return "#$n" } else { return $fallback } }

function New-LumensIssue {
    param([string]$Title, [string]$Body, [string]$Milestone, [string[]]$ExtraLabels, [hashtable]$Refs)
    if ($Refs) { foreach ($k in $Refs.Keys) { $Body = $Body.Replace(('{{' + $k + '}}'), $Refs[$k]) } }
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $Body -Encoding utf8
    $labelArg = (@($Label) + $ExtraLabels) -join ","
    Write-Host "Creating: $Title" -ForegroundColor Green
    $result = gh issue create --repo $Repo --title "$Title" --body-file "$tmp" --label "$labelArg" --milestone "$Milestone"
    Remove-Item $tmp -Force
    $text = ($result | Out-String)
    if ($text -match '/issues/(\d+)') { Write-Host "  -> #$($Matches[1])" -ForegroundColor DarkGray; return $Matches[1] }
    Write-Host "  -> could not parse issue number from: $text" -ForegroundColor Yellow
    return $null
}

$n1 = New-LumensIssue -Milestone $Milestones[0] -ExtraLabels @("bug","good first issue","contract") `
    -Title "1. Fix flaky test_real_upgrade_and_state_migration" `
    -Refs @{  } `
    -Body @'
**Depends on:** nothing. First issue in the sequence.

**Scope:** One test file, one line added. No production code changes.

**Files created or touched:**
- lumens-vault/contracts/lumens-vault/src/test.rs (edit)

**Acceptance criteria:**
- [ ] Add `env.ledger().with_mut(|l| l.sequence_number = 100_000);` right after `env.mock_all_auths();` in test_real_upgrade_and_state_migration (the test inherits an unpinned default ledger sequence and failed once, then passed on rerun with no code change)
- [ ] Run `cargo test` at least 5 times in a row with no code changes between runs; all 5 must pass
- [ ] PR description states how many consecutive passing runs were observed, with real output

**Non-goals:** Do not touch any other test in this pass.
'@

$n2 = New-LumensIssue -Milestone $Milestones[0] -ExtraLabels @("contract","breaking-change") `
    -Title "2. Restore per-deposit lock period selection (7/30/90 days)" `
    -Refs @{ DEP1 = (Ref $n1 "issue 1") } `
    -Body @'
**Depends on:** {{DEP1}} (the test suite must be stable before the contract API changes)

**Scope:** Contract only. Replaces the single admin-set default lock with global min/max bounds and a required per-deposit `lock_ledgers`. Changes the config struct, deposit's signature, the constructor's signature, adds one error, one view, one event. Decided: `lock_ledgers` is ALWAYS required (no default fallback) and bounds are GLOBAL (not per-asset). Before starting, confirm nothing has been deployed anywhere; if any instance exists, add `VaultConfig::V2` instead of editing V1 in place.

**Files created or touched:**
- lumens-vault/contracts/lumens-vault/src/storage.rs (edit: VaultConfigV1 becomes min_lock_ledgers + max_lock_ledgers; default_timelock_ledgers removed)
- lumens-vault/contracts/lumens-vault/src/contract.rs (edit: deposit, __constructor, update_config, new Error variant, new view)
- lumens-vault/contracts/lumens-vault/src/events.rs (edit: add ConfigUpdatedEvent)
- lumens-vault/contracts/lumens-vault/src/test.rs (edit: update every register/deposit call site, add boundary tests)
- lumens-vault/contracts/lumens-vault-v2-fixture/src/storage.rs (edit only if needed to keep the fixture's config shape in sync; the upgrade test must still pass)

**Acceptance criteria:**
- [ ] `deposit(env, from, asset, amount, lock_ledgers)` rejects `lock_ledgers` outside [min_lock_ledgers, max_lock_ledgers] with new `Error::InvalidLockPeriod = 8` (append; do not renumber existing codes)
- [ ] `unlock_ledger` is computed with checked arithmetic; overflow returns an error instead of wrapping or trapping
- [ ] `__constructor(env, admin, min_lock_ledgers, max_lock_ledgers)` validates `0 < min <= max`. Choose between panic_with_error! and a Result-returning constructor by compiling against soroban-sdk 28, and record the choice in the PR (do not assume)
- [ ] `update_config(min, max)` applies the same validation and emits `ConfigUpdatedEvent` (topic: admin; data: min_lock_ledgers, max_lock_ledgers)
- [ ] New view `get_lock_bounds() -> (u32, u32)` so the frontend can read live bounds (the contract had no config getter)
- [ ] Tests: deposit at min boundary succeeds, at max boundary succeeds, below min fails, above max fails, constructor rejects min > max and zero values, update_config rejects invalid bounds
- [ ] Every existing test that calls register or deposit is updated; nothing still uses the old signatures
- [ ] `cargo test` green (with output) and `stellar contract build` succeeds

**Non-goals:** No frontend lock-period picker (that is issue 11). No per-asset bounds. No default-lock fallback.
'@

$n3 = New-LumensIssue -Milestone $Milestones[0] -ExtraLabels @("devops","breaking-change") `
    -Title "3. Update deploy scripts and docs for constructor-based init" `
    -Refs @{ DEP2 = (Ref $n2 "issue 2") } `
    -Body @'
**Depends on:** {{DEP2}} (needs the final constructor signature, including lock bounds)

**Scope:** Deployment tooling and documentation only. No contract code changes. The team is on Windows PowerShell, so PowerShell is the primary script.

**Files created or touched:**
- lumens-vault/scripts/deploy.ps1 (new or edit; a .sh twin is optional)
- lumens-vault/docs/deploy.md (new)

**Acceptance criteria:**
- [ ] Deploy passes admin, min_lock_ledgers and max_lock_ledgers as constructor args at deploy time, never via a separate initialize call
- [ ] Constructor-arg flag spelling (kebab vs snake case) is verified with `stellar contract deploy ... -- --help` and the verified spelling is used; do not copy it from any document
- [ ] docs/deploy.md documents the exact fresh-testnet sequence start to finish, including the `stellar contract build` requirement for `overflow-checks = true`
- [ ] If admin differs from the deployer, the doc shows how to build a transaction carrying both parties' authorizations (the constructor calls admin.require_auth())
- [ ] No secret key appears in any file; keys are referenced by env var name only

**Non-goals:** Not deciding the mainnet admin or multisig setup (TECH_SPEC Open Question 4). When that is set up, the account's MEDIUM threshold must be configured deliberately (TECH_SPEC FR-8).
'@

$n4 = New-LumensIssue -Milestone $Milestones[0] -ExtraLabels @("contract","testing") `
    -Title "4. Expand contract test coverage to every Error variant and admin function" `
    -Refs @{ DEP3 = (Ref $n3 "issue 3") } `
    -Body @'
**Depends on:** {{DEP3}} (the contract API and deploy flow are now final)

**Scope:** Contract test file only. Written against the now-final contract API.

**Files created or touched:**
- lumens-vault/contracts/lumens-vault/src/test.rs (edit)

**Acceptance criteria:**
- [ ] deposit and withdraw fail with Error::Paused when paused and succeed after unpause
- [ ] deposit fails with Error::AssetNotWhitelisted for a non-whitelisted asset
- [ ] After remove_asset, existing deposits of that asset can still be withdrawn (permanent regression test for the delisting fix)
- [ ] transfer_admin succeeds and the previous admin's later admin calls are verified to actually fail; assert what really happens, do not assume
- [ ] update_config changes bounds and a later deposit is validated against the new ones
- [ ] Every variant of Error, including InvalidLockPeriod, is triggered by at least one test
- [ ] A test asserts the topic count of every event type from env.events().all() and that no event exceeds 4 topics (TECH_SPEC NFR-3); this also settles what a bare #[contractevent] generates
- [ ] `cargo test` output shown in the PR, run at least 3 times

**Non-goals:** No fuzz or property-based testing in this pass.
'@

$n5 = New-LumensIssue -Milestone $Milestones[1] -ExtraLabels @("backend","frontend","scaffolding") `
    -Title "5. Scaffold backend and frontend folder structure" `
    -Refs @{ DEP4 = (Ref $n4 "issue 4") } `
    -Body @'
**Depends on:** {{DEP4}} (the contract is frozen and fully tested before off-chain work builds against it)

**Scope:** Exactly what lumens-vault/docs/SCAFFOLD_BRIEF.md specifies: folders, config files, real interfaces in ports/, stubs everywhere else. Zero business logic, zero real UI. Owner: Gemini, reviewed against the brief. The four port interfaces are provided pre-written and type-checked in the handoff addendum (ports/*.ts); use them as the port files.

**Files created or touched:**
- lumens-vault/backend/** (full tree in SCAFFOLD_BRIEF.md)
- lumens-vault/frontend/** (full tree in SCAFFOLD_BRIEF.md)

**Acceptance criteria:**
- [ ] Folder tree matches SCAFFOLD_BRIEF.md exactly, nothing extra
- [ ] `npm install && npm run build` succeeds in backend/ with zero errors
- [ ] `npm install && npm run dev` starts the frontend with zero errors
- [ ] No function body is longer than a throw or a TODO comment (show the grep)
- [ ] `git status` shows nothing changed outside lumens-vault/, and nothing under lumens-vault/contracts/
- [ ] PR description lists every file created

**Non-goals:** No business logic. No wallet integration. No real UI. No root-level monorepo tooling. No modification of contracts/.
'@

$n6 = New-LumensIssue -Milestone $Milestones[1] -ExtraLabels @("backend") `
    -Title "6. Minimal events-reader for deposit/withdraw/admin-action history" `
    -Refs @{ DEP5 = (Ref $n5 "issue 5") } `
    -Body @'
**Depends on:** {{DEP5}} (needs the scaffold's ports, adapters and domain files)

**Scope:** First real backend feature: event polling, state reconstruction, admin-action detection, whitelist derivation. Replaces stubs with real implementations.

**Files created or touched:**
- lumens-vault/backend/src/adapters/soroban-rpc/index.ts (stub to real)
- lumens-vault/backend/src/adapters/sqlite/index.ts (stub to real)
- lumens-vault/backend/src/domain/vault-state.ts (stub to real)
- lumens-vault/backend/src/domain/alert-correlation.ts (stub to real)
- lumens-vault/backend/src/api/index.ts (add real read endpoints)
- lumens-vault/backend/test/ (real tests replacing placeholders)

**Acceptance criteria:**
- [ ] Polls getEvents and deduplicates by event id (overlapping poll windows and retries; NOT reorgs, Stellar SCP has immediate finality, so build no rollback logic)
- [ ] Confirms the actual retention window of the RPC provider in use (getHealth) and designs polling cadence and outage recovery against that confirmed number, not an assumed one (TECH_SPEC Open Question 5)
- [ ] Respects the real getEvents per-response record cap; verify the current value at implementation time
- [ ] Reconstructs per-user (asset, vault_id), balance and unlock ledger; a sample is cross-checked against the contract's own get_vault
- [ ] Derives the current whitelist from WhitelistEvent and DelistEvent (asset is event data, not a topic, and the contract has no whitelist enumeration)
- [ ] Detects and stores pause, unpause, upgrade, new_admin, whitelist, delist and config_updated occurrences and notifies through IAlertSink
- [ ] Amounts handled as bigint and stored as TEXT, never JS number
- [ ] Read API: my vaults by address, recent admin activity, current whitelist

**Non-goals:** No PagerDuty, no Postgres or Redis, no audit-log-grade guarantees, no reorg rollback. This is a display cache (TECH_SPEC NFR-4).
'@

$n7 = New-LumensIssue -Milestone $Milestones[1] -ExtraLabels @("sorokeep-integration","devops") `
    -Title "7. Register the deployed contract with Sorokeep and configure a guard policy" `
    -Refs @{ DEP3 = (Ref $n3 "issue 3") } `
    -Body @'
**Depends on:** {{DEP3}}

**Scope:** CLI operations against the real Sorokeep tool plus documentation. No code in this repo beyond the doc. Sequenced after issue 6 for a linear backlog; it only needs the deploy flow from issue 3.

**Files created or touched:**
- lumens-vault/docs/sorokeep-setup.md (new)

**Acceptance criteria:**
- [ ] `sorokeep watch <contract-id> --network testnet --name "Lumens Vault"` is run against the deployed contract
- [ ] A guard policy is configured with flags verified against live `sorokeep guard --help` (a conservative-leaning preset, since this will hold real funds; keypair via env var name only, never a secret in a file)
- [ ] Document whether `--storage-keys` can track individual Vault(user, asset, id) entries and wire it up if so; this is the original many-persistent-entries showcase
- [ ] Confirm or refute the working assumption that Sorokeep does not consume application events, against its actual source, and record the result
- [ ] Decide and record the data source for the Operations page (Sorokeep --json CLI output, its SQLite DB, or its MCP server) with the tradeoff
- [ ] docs/sorokeep-setup.md records the exact commands used so a fresh deploy is reproducible

**Non-goals:** No custom TTL-monitoring or auto-extension code; that is Sorokeep's job entirely.
'@

$n8 = New-LumensIssue -Milestone $Milestones[1] -ExtraLabels @("sorokeep-integration","backend") `
    -Title "8. Webhook receiver for Sorokeep alerts" `
    -Refs @{ DEP6 = (Ref $n6 "issue 6"), DEP7 = (Ref $n7 "issue 7") } `
    -Body @'
**Depends on:** {{DEP6}} and {{DEP7}}

**Scope:** Implements the alert-receipt adapter, wired into the SQLite store issue 6 created.

**Files created or touched:**
- lumens-vault/backend/src/adapters/sorokeep-webhook/index.ts (stub to real)
- lumens-vault/backend/src/api/index.ts (add the webhook endpoint)
- lumens-vault/backend/test/ (signature verification and storage tests)

**Acceptance criteria:**
- [ ] `sorokeep` is an npm dependency (already in package.json from issue 5)
- [ ] The endpoint verifies each payload with verifyWebhookSignature against the raw request body and rejects anything that fails (X-Sorokeep-Signature header)
- [ ] Verified alerts are stored in the same store issue 6 created, with contract, entry, threshold and timestamp
- [ ] `sorokeep alerts add --contract <id> --type webhook --url <endpoint> --threshold <ledgers>` configured with flags verified live
- [ ] The webhook secret is read from an env var, never committed

**Non-goals:** No retry or replay logic for missed webhooks in this pass.
'@

$n9 = New-LumensIssue -Milestone $Milestones[1] -ExtraLabels @("backend") `
    -Title "9. Reflector (SEP-40) client for USD valuation, off-chain only" `
    -Refs @{ DEP6 = (Ref $n6 "issue 6") } `
    -Body @'
**Depends on:** {{DEP6}}

**Scope:** Implements the price-oracle adapter and valuation domain logic. USD valuation is in scope for v1 (decided). It lives only in the backend.

**Files created or touched:**
- lumens-vault/backend/src/adapters/reflector/index.ts (stub to real)
- lumens-vault/backend/src/domain/valuation.ts (stub to real)
- lumens-vault/backend/test/ (fresh, stale, deviant and unavailable cases)

**Acceptance criteria:**
- [ ] Reads lastprice, decimals and resolution from Reflector by simulation only: no signing, no fees
- [ ] Current testnet and mainnet Reflector contract IDs are taken from Reflector's official docs and cross-checked on stellar.expert; none is hardcoded from memory or a secondary source
- [ ] Staleness guard and deviation guard are both implemented and tested
- [ ] A clear 'unavailable' status (or a documented TWAP fallback) when guards trip or an asset has no price; never a silent guess
- [ ] Decimals handled explicitly per whitelisted asset; do not assume XLM's decimals

**Non-goals:** No on-chain price reads. No multi-oracle aggregation. No liquidation or collateral logic.
'@

$n10 = New-LumensIssue -Milestone $Milestones[2] -ExtraLabels @("design") `
    -Title "10. Wireframes and mockups handoff" `
    -Refs @{  } `
    -Body @'
**Depends on:** nothing technically. This could have run in parallel with the backend at any point. It is placed here only for a linear backlog.

**Scope:** Design artifacts only, produced in the Claude chat with the Design artifact type.

**Files created or touched:**
- lumens-vault/docs/wireframes.md (new; pointer to the design artifact plus the key decisions)

**Acceptance criteria:**
- [ ] Core views specified: Dashboard, Deposit flow (with the lock-period picker), My Vaults, Operations page
- [ ] States designed for: stale, deviant and unavailable price; paused contract; a vault whose entry was archived (and a decision on whether a restore prompt is in v1; if yes it becomes its own issue)
- [ ] Explicit written approval by the maintainer before issue 11 starts

**Non-goals:** No implementation code.
'@

$n11 = New-LumensIssue -Milestone $Milestones[2] -ExtraLabels @("frontend") `
    -Title "11. Next.js frontend implementation" `
    -Refs @{ DEP10 = (Ref $n10 "issue 10"), DEP6 = (Ref $n6 "issue 6"), DEP7 = (Ref $n7 "issue 7"), DEP9 = (Ref $n9 "issue 9") } `
    -Body @'
**Depends on:** {{DEP10}} and {{DEP6}} and {{DEP7}} and {{DEP9}}

**Scope:** Fills in the route stubs from issue 5 with the approved designs and real backend data.

**Files created or touched:**
- lumens-vault/frontend/app/page.tsx (dashboard)
- lumens-vault/frontend/app/deposit/page.tsx (deposit flow)
- lumens-vault/frontend/app/vaults/page.tsx (my vaults)
- lumens-vault/frontend/app/operations/page.tsx (operations)
- lumens-vault/frontend/lib/** (Freighter integration, API client; new)

**Acceptance criteria:**
- [ ] Freighter wallet connection works
- [ ] The deposit flow's lock-period picker reads live bounds from the contract via get_lock_bounds, not hardcoded values
- [ ] The asset dropdown is fed by the backend's derived whitelist
- [ ] The operations page shows genuinely real Sorokeep and alert data, not mocked
- [ ] The dashboard USD total visibly shows the stale, deviant and unavailable states from issue 9 when they occur

**Non-goals:** Do not start before issue 10 is approved.
'@

Write-Host "`nDone. 11 issues created in dependency order with real cross-links." -ForegroundColor Cyan
