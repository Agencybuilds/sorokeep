// Port: price data for USD valuation. Off-chain only; the Soroban contract never calls this.
// Reflector (SEP-40) is the intended adapter. Reads are simulation-only (no signing, no fees).

export interface PriceReading {
  /** Asset contract address (or symbol, per the oracle's Asset type) this price is for. */
  asset: string;
  /** Raw price, scaled by 10^decimals. */
  price: bigint;
  decimals: number;
  /** Unix seconds when the oracle recorded this price. Used by the staleness guard. */
  timestamp: number;
  /** Oracle update period in seconds (SEP-40 resolution). Useful for choosing a stale threshold. */
  resolutionSeconds: number;
}

export interface IPriceOracle {
  /** Null when the oracle has no price for this asset. Never invent a price. */
  getLastPrice(asset: string): Promise<PriceReading | null>;
}
