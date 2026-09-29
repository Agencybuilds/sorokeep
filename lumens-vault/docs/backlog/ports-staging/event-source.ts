// Port: where contract events come from. The adapter (adapters/soroban-rpc) decodes raw RPC
// events into these typed shapes so the domain never sees XDR.

export interface EventBase {
  /** Unique RPC event id. This is the dedup key (overlapping poll windows and retries). */
  id: string;
  ledger: number;
  /** ISO-8601 close time of the ledger that contained the event. */
  ledgerClosedAt: string;
  txHash: string;
}

/** Amounts are bigint (Soroban i128). Never use JS number for token amounts. */
export type VaultEvent =
  | (EventBase & { type: "deposit"; from: string; asset: string; vaultId: number; amount: bigint })
  | (EventBase & { type: "withdraw"; to: string; asset: string; vaultId: number; amount: bigint })
  | (EventBase & { type: "pause"; admin: string })
  | (EventBase & { type: "unpause"; admin: string })
  | (EventBase & { type: "whitelist"; admin: string; asset: string })
  | (EventBase & { type: "delist"; admin: string; asset: string })
  | (EventBase & { type: "new_admin"; admin: string; newAdmin: string })
  | (EventBase & { type: "upgrade"; admin: string; newWasmHash: string })
  // Present only if issue 2 adds ConfigUpdatedEvent to the contract.
  | (EventBase & { type: "config_updated"; admin: string; minLockLedgers: number; maxLockLedgers: number });

export interface FetchEventsParams {
  /** First call: a ledger to start from. Later calls: prefer cursor. One of the two is required. */
  startLedger?: number;
  cursor?: string;
  /** Provider caps apply (RPC getEvents caps records per response). Verify the current cap. */
  limit?: number;
}

export interface EventPage {
  events: VaultEvent[];
  /** Null when the adapter has reached the tip. */
  nextCursor: string | null;
  latestLedger: number;
  /** Oldest ledger the provider still serves. Retention differs per provider; never assume it. */
  oldestLedger: number;
}

export interface IEventSource {
  fetchEvents(params: FetchEventsParams): Promise<EventPage>;
  getLedgerBounds(): Promise<{ oldestLedger: number; latestLedger: number }>;
}
