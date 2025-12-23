import { Injectable, Logger } from "@nestjs/common";
import { OtcQuoteProvider } from "../otc-quote.prefetcher";
import { OTCQuote } from "src/types/routing/quotes";

/**
 * DEX Provider - Simulates Jupiter/Orca/Raydium quotes
 * Provides quotes with different rates and spreads compared to OTC
 */
@Injectable()
export class DexProvider implements OtcQuoteProvider {
  private readonly logger = new Logger(DexProvider.name);
  readonly venueId = "dex:jupiter";

  async fetchQuotes(): Promise<OTCQuote[]> {
    const now = Date.now();
    const quotes: OTCQuote[] = [
      {
        venueId: this.venueId,
        fromToken: "USDC",
        toToken: "USDT",
        amountIn: 1000,
        amountOut: 999.5,
        maxAmountIn: 1000000,
        feeBps: 5,
        expiry: now + 5000, // 5s (short expiry for DEX)
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01, // Near-instant on-chain
          counterpartyRisk: 0.0001, // Very low (smart contract)
          supportsReservation: false, // DEX doesn't support reservation
          paymentMethods: ["on_chain"],
        },
      },
      // USDT → USDC via DEX (reverse)
      {
        venueId: this.venueId,
        fromToken: "USDT",
        toToken: "USDC",
        amountIn: 1000,
        amountOut: 999.5,
        maxAmountIn: 1000000,
        feeBps: 5,
        expiry: now + 5000,
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01,
          counterpartyRisk: 0.0001,
          supportsReservation: false,
          paymentMethods: ["on_chain"],
        },
      },
      // USDC → EURC via DEX (on-chain stablecoin swap - best rate)
      {
        venueId: this.venueId,
        fromToken: "USDC",
        toToken: "EURC",
        amountIn: 1000,
        amountOut: 915, // ~0.915 EURC per USDC (better than OTC's 0.912)
        maxAmountIn: 1000000,
        feeBps: 20, // 0.2% (lower than OTC's 0.35%)
        expiry: now + 5000,
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01,
          counterpartyRisk: 0.0001,
          supportsReservation: false,
          paymentMethods: ["on_chain"],
        },
      },
      // USDT → EURC via DEX (alternative on-chain route)
      {
        venueId: this.venueId,
        fromToken: "USDT",
        toToken: "EURC",
        amountIn: 1000,
        amountOut: 914, // ~0.914 EURC per USDT
        maxAmountIn: 1000000,
        feeBps: 20,
        expiry: now + 5000,
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01,
          counterpartyRisk: 0.0001,
          supportsReservation: false,
          paymentMethods: ["on_chain"],
        },
      },
      // USDC → EURC via DEX (alternative stablecoin route)
      {
        venueId: this.venueId,
        fromToken: "USDC",
        toToken: "EURC",
        amountIn: 1000,
        amountOut: 915, // ~0.915 EURC per USDC
        maxAmountIn: 1000000,
        feeBps: 20, // 0.2%
        expiry: now + 5000,
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01,
          counterpartyRisk: 0.0001,
          supportsReservation: false,
          paymentMethods: ["on_chain"],
        },
      },
      // EURC → USDC via DEX (reverse)
      {
        venueId: this.venueId,
        fromToken: "EURC",
        toToken: "USDC",
        amountIn: 1000,
        amountOut: 1092, // ~1.092 USDC per EURC
        maxAmountIn: 1000000,
        feeBps: 20,
        expiry: now + 5000,
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01,
          counterpartyRisk: 0.0001,
          supportsReservation: false,
          paymentMethods: ["on_chain"],
        },
      },
      // USDT → EURC via DEX
      {
        venueId: this.venueId,
        fromToken: "USDT",
        toToken: "EURC",
        amountIn: 1000,
        amountOut: 914, // ~0.914 EURC per USDT
        maxAmountIn: 1000000,
        feeBps: 20,
        expiry: now + 5000,
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.01,
          counterpartyRisk: 0.0001,
          supportsReservation: false,
          paymentMethods: ["on_chain"],
        },
      },
    ];

    this.logger.log(`Fetched ${quotes.length} DEX quotes`);
    return quotes;
  }
}
