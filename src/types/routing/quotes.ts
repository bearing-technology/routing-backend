export interface OTCQuote {
  venueId: string;
  fromToken: string;
  toToken: string;
  /** Total input amount this quote was requested for */
  amountIn: number;
  /** Quoted output for the given amountIn */
  amountOut: number;
  /** Optional max size supported by the venue for this quote */
  maxAmountIn?: number;
  /** Optional fee expressed in basis points */
  feeBps?: number;
  /** Epoch millis when the quote expires */
  expiry: number;
  /** OTC deposit address if the venue is non-programmable */
  depositAddress?: string;
  /** When this quote was fetched (epoch millis) */
  lastUpdated: number;
  /** Settlement metadata for scoring */
  settlementMeta?: {
    /** Expected settlement time in days */
    settlementDays: number;
    /** Counterparty risk factor (0-1) */
    counterpartyRisk: number;
    /** Whether OTC supports API reservation */
    supportsReservation: boolean;
    /** Payment methods supported (PIX, SPEI, bank transfer, etc.) */
    paymentMethods?: string[];
  };
}

export interface PriceSnapshot {
  venueId: string;
  base: string;
  quote: string;
  price: number;
  liquidity: number;
  slippageBps?: number;
  lastUpdated: number;
}
