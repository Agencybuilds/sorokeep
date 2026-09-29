// Port: storage for the display cache. This is a read model, never the source of truth for
// fund safety. All amounts are bigint in the domain; adapters store them as TEXT.

import type { VaultEvent } from "./event-source.js";
import type { PriceReading } from "./price-oracle.js";

export interface IngestionCursor {
  contractId: string;
  lastProcessedLedger: number;
  lastCursor: string | null;
  updatedAt: string;
}

export interface VaultRecord {
  user: string;
  asset: string;
  vaultId: number;
  balance: bigint;
  unlockLedger: number;
  createdLedger: number;
  updatedLedger: number;
}

export interface WhitelistRecord {
  asset: string;
  isWhitelisted: boolean;
  updatedLedger: number;
}

export type AdminActionType =
  | "pause" | "unpause" | "whitelist" | "delist" | "new_admin" | "upgrade" | "config_updated";

export interface AdminActionRecord {
  eventId: string;
  ledger: number;
  actionType: AdminActionType;
  admin: string;
  payload: Record<string, string | number>;
  timestamp: string;
}

/** Mirrors the fields of Sorokeep's webhook payload. */
export interface SorokeepAlertRecord {
  id: string;
  type: "threshold_crossed" | "alert_resolved";
  severity: "critical" | "warning" | "info";
  contractId: string;
  contractName: string;
  network: string;
  entryKeyXdr: string;
  entryType: string;
  entryLabel: string;
  configuredThresholdLedgers: number;
  currentRemainingLedgers: number;
  firedAtLedger: number;
  timestamp: string;
  receivedAt: string;
}

export type PriceStatus = "fresh" | "stale" | "deviant" | "unavailable";

export interface PriceCacheRecord {
  asset: string;
  reading: PriceReading | null;
  status: PriceStatus;
  fetchedAt: string;
}

export interface IVaultRepository {
  /** Idempotent by event id. Returns the number of events actually inserted (not duplicates). */
  saveEvents(events: VaultEvent[]): Promise<number>;

  getCursor(contractId: string): Promise<IngestionCursor | null>;
  setCursor(cursor: IngestionCursor): Promise<void>;

  upsertVault(vault: VaultRecord): Promise<void>;
  getVault(user: string, asset: string, vaultId: number): Promise<VaultRecord | null>;
  getVaultsByUser(user: string): Promise<VaultRecord[]>;

  setWhitelisted(record: WhitelistRecord): Promise<void>;
  getWhitelist(): Promise<WhitelistRecord[]>;

  saveAdminAction(action: AdminActionRecord): Promise<void>;
  listAdminActions(limit: number): Promise<AdminActionRecord[]>;

  saveSorokeepAlert(alert: SorokeepAlertRecord): Promise<void>;
  listSorokeepAlerts(contractId: string, limit: number): Promise<SorokeepAlertRecord[]>;

  savePrice(record: PriceCacheRecord): Promise<void>;
  getPrice(asset: string): Promise<PriceCacheRecord | null>;

  /** Run several writes atomically (e.g. events + vault updates + cursor advance). */
  runInTransaction<T>(fn: (repo: IVaultRepository) => Promise<T>): Promise<T>;
}
