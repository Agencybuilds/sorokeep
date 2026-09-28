# Lumens Vault — System Design Document

**Status:** DRAFT — companion to `TECH_SPEC.md`. Architecture pattern is
DECIDED (see §3). Component grouping below is now fixed accordingly.

---

## 1. Components and Responsibilities

### 1.1 Smart Contract (on-chain, Rust/Soroban)

The single source of truth for fund safety. Owns:
- Whitelist enforcement, pause state, lock-period bounds
- Balance arithmetic and lock-expiry checks
- Event emission (`DepositEvent`, `WithdrawEvent`, `PauseEvent`,
  `UnpauseEvent`, `WhitelistEvent`, `DelistEvent`, `NewAdminEvent`,
  `UpgradeEvent`)
- Point-lookup view functions (`get_vault`, `is_paused`, `is_whitelisted`,
  `get_admin_address`, `get_user_vault_count`)
- Native upgrade support (versioned storage enums)

Explicitly does **not** own: price data, multi-vault enumeration, or
anything requiring cross-contract calls beyond the SAC token interface it
already uses for transfers.

### 1.2 Sorokeep (external, already built — not part of this project's codebase)

Owns TTL/lifecycle health for the contract's storage: instance, WASM, and
(ideally) individual `Vault(...)` entries. Runs its own polling/guard
daemon, its own local SQLite store, and its own alerting (Slack, PagerDuty,
webhooks, etc.). This project consumes it — via CLI registration at deploy
time and via its webhook output — and never reimplements any part of it.

**Important distinction, stated explicitly because earlier drafts of this
project conflated the two:** Sorokeep's documented command surface and
database schema (`contracts`, `contract_entries`, `extension_policies`,
`alerts_fired`, `extension_history`) are entirely about storage-entry
lifecycle — nothing in what's publicly documented is shaped like a
generic application-event indexer. Working assumption, not a confirmed
guarantee: Sorokeep reads ledger storage/TTL state directly and does not
consume the contract's *application events* (deposits, withdrawals, admin
actions). Whoever picks up the Sorokeep-integration issue should confirm
this against Sorokeep's actual current source before assuming it — the
distinction matters because if it turns out wrong, the "two separate data
paths" model below needs to change.

### 1.3 Application-Data Responsibilities (component grouping TBD — see §3)

These are things that must happen somewhere; they are described here as
responsibilities, not as one fixed service, since how they're grouped is
the open architecture question:

- **Event ingestion:** poll `getEvents` for this contract, deduplicate by
  event ID (for overlapping poll windows/retries — Stellar's SCP gives
  immediate finality, so there is no reorg-handling problem to solve here,
  and no rollback logic should be built for one). Retention caveat,
  precise on purpose because the imprecise version of this fact has
  already caused a design mistake once in this project's history:
  Stellar's own docs state the network *can* support querying up to 7 days
  back, but a given RPC node retains only what it's configured to — public
  nodes commonly default to 24 hours. Whatever provider is actually used
  needs its real retention confirmed directly, and the ingestion
  cadence/outage-recovery design should be built against that confirmed
  number, not against either figure assumed in isolation.
- **State reconstruction:** per user, which (asset, vault_id) pairs exist,
  current balance, unlock ledger — since the contract has no enumeration
  function (NFR-6 in the tech spec)
- **Admin-action alerting:** surfacing `pause`/`upgrade`/`whitelist`/
  `delist`/`transfer_admin` — Sorokeep will never do this, so it has to
  live here
- **Sorokeep webhook receipt:** verify (`verifyWebhookSignature`) and store
  incoming alerts for display
- **Price valuation:** Reflector (SEP-40) client, simulation-only reads,
  staleness + deviation guards, per-asset decimal handling

All of this is explicitly a **display/read-model layer** (NFR-4): if it's
wrong or unavailable, the worst outcome is a stale number on a dashboard.
Actual withdraw eligibility is always checked live on-chain. This bounds
how much reliability engineering it needs and is a deliberate constraint
on the architecture research in §3, not just a note.

### 1.4 Frontend (Next.js, not yet built — blocked on design)

Wallet connection, deposit/withdraw flows (including the lock-period
picker), a vaults list, and an operations/health page. See `TECH_SPEC.md`
FR-24 — implementation does not start before wireframes are approved.

---

## 2. Data Flow

**A deposit:**
```
User → Frontend → (sign via Freighter) → Soroban Contract
                                              │
                                              ├─ writes VaultEntry, UserVaultCount
                                              ├─ extends TTL of what it touched
                                              └─ emits DepositEvent
                                                     │
                                    Application-Data layer polls & ingests
                                                     │
                                          Dashboard/vaults-list updates
```

**Lifecycle safety (entirely separate path — does not go through events at all):**
```
Sorokeep daemon → polls contract storage TTL directly via RPC
                → extends via guard policy if below threshold
                → fires webhook alert if a threshold is crossed anyway
                       │
              Application-Data layer receives, verifies, stores
                       │
                Operations page displays it
```

**Dashboard valuation:**
```
Application-Data layer → simulates lastprice() against Reflector contract
                        → applies staleness/deviation guards
                        → computes USD figure for display only
```//—never touches the vault contract.

---

## 3. Decided: Architecture Pattern

**Deployment topology: modular monolith backend. Three deployables total:**
the Soroban contract, one `backend/` process, and the `frontend/` app.
Sorokeep is external and is not part of this codebase.

**Why:** seven comparable, real Soroban dapp repositories (lending,
remittance, supply chain, subscriptions, AMM, grants) were checked. All
use a `contracts/` + `backend/` + `frontend/` monorepo, and every backend
is a single service even when it does several jobs (indexing, caching,
notifications). None splits into microservices. That matches this
project's constraints: small team, contributors taking one scoped issue at
a time, and a display layer with a deliberately low correctness bar
(NFR-4). Microservices would add deployment and networking cost with no
scaling benefit.

**Internal organization of `backend/`: hexagonal (ports & adapters).**
The backend's job is talking to several swappable external systems (RPC
provider, Reflector, Sorokeep webhook, persistence), and the tech spec
already requires testing each in isolation. (Requested originally as
"diagonal architecture"; not a recognized pattern, taken as hexagonal.)

**Backend language: TypeScript**, because `sorokeep` is an npm package
and `verifyWebhookSignature` must be imported natively, not reimplemented.

**Persistence: SQLite** (display cache, not source of truth).

### Folder structure (all inside the self-contained `lumens-vault/` folder)

```
lumens-vault/
├── contracts/
│   ├── lumens-vault/              # the real contract
│   └── lumens-vault-v2-fixture/   # disposable, proves the upgrade path
├── backend/
│   └── src/
│       ├── domain/                # pure logic: vault-state, alert-correlation, valuation
│       ├── ports/                 # interfaces only
│       ├── adapters/              # soroban-rpc, reflector, sorokeep-webhook, sqlite
│       └── api/                   # what the frontend calls
├── frontend/                      # Next.js, blocked on wireframes
├── docs/
├── scripts/
├── README.md
└── CONTRIBUTING.md
```

Nothing Lumens-Vault-specific lives outside `lumens-vault/`, so moving it
to its own repository later is moving one folder.

### How it scales

Not by pre-splitting. Boundaries stay clean so extraction is mechanical if
a measured need appears. Storage growth is Sorokeep's job. Contributor
growth is what the port/adapter boundaries buy. An adapter can become its
own service later without a rewrite.

---

## 4. Explicitly Deferred

- The admin account model (classic multisig G-account vs. a Soroban smart
  contract account) — see `TECH_SPEC.md` FR-8 and Open Question 4. This
  affects deploy tooling and the constructor's expectations, not the
  component design above, so it's tracked there rather than duplicated
  here.
- Where the frontend is hosted/deployed
- Whether the application-data layer and the Sorokeep-webhook receiver are
  the same process or two
- Database technology beyond "not Postgres/Redis at this scale" (NFR-4/§1.3)
  — SQLite is the working assumption, not yet a final decision
