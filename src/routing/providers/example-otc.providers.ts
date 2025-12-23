import { Injectable, Logger } from "@nestjs/common";
import { OtcQuoteProvider } from "../otc-quote.prefetcher";
import { OTCQuote } from "src/types/routing/quotes";

/**
 * Example OTC provider for BRL → EUR corridor
 * In production, this would call actual OTC API (Circle, Coinbase, etc.)
 */
@Injectable()
export class BrlEurOtcProvider implements OtcQuoteProvider {
  private readonly logger = new Logger(BrlEurOtcProvider.name);
  readonly venueId = "otc:brl-eur:provider1";

  async fetchQuotes(): Promise<OTCQuote[]> {
    // In production, this would make HTTP calls to OTC API
    // For MVP demo, return mock quotes
    const now = Date.now();
    const quotes: OTCQuote[] = [
      {
        venueId: this.venueId,
        fromToken: "BRL",
        toToken: "EUR",
        amountIn: 1000,
        amountOut: 180, // ~0.18 EUR per BRL
        maxAmountIn: 100000,
        feeBps: 50, // 0.5%
        expiry: now + 30000, // 30s
        depositAddress: "0x1234567890abcdef...", // Mock deposit address
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.5, // Same day settlement for PIX
          counterpartyRisk: 0.001, // 0.1%
          supportsReservation: true,
          paymentMethods: ["PIX", "bank_transfer"],
        },
      },
      {
        venueId: this.venueId,
        fromToken: "BRL",
        toToken: "USDC",
        amountIn: 1000,
        amountOut: 200, // ~0.20 USDC per BRL
        maxAmountIn: 100000,
        feeBps: 40,
        expiry: now + 30000,
        depositAddress: "0x1234567890abcdef...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.5,
          counterpartyRisk: 0.001,
          supportsReservation: true,
          paymentMethods: ["PIX"],
        },
      },
      // Alternative: BRL → USDT (different spread)
      {
        venueId: this.venueId,
        fromToken: "BRL",
        toToken: "USDT",
        amountIn: 1000,
        amountOut: 199, // Slightly worse rate: 0.199 vs 0.20
        maxAmountIn: 100000,
        feeBps: 45, // Higher fee: 0.45%
        expiry: now + 30000,
        depositAddress: "0x1234567890abcdef...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.5,
          counterpartyRisk: 0.001,
          supportsReservation: true,
          paymentMethods: ["PIX"],
        },
      },
      // Alternative: BRL → EURC (direct to EUR stablecoin)
      {
        venueId: this.venueId,
        fromToken: "BRL",
        toToken: "EURC",
        amountIn: 1000,
        amountOut: 180, // ~0.18 EURC per BRL
        maxAmountIn: 100000,
        feeBps: 55, // Higher fee for direct EURC
        expiry: now + 30000,
        depositAddress: "0x1234567890abcdef...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.5,
          counterpartyRisk: 0.001,
          supportsReservation: true,
          paymentMethods: ["PIX"],
        },
      },
    ];

    this.logger.log(`Fetched ${quotes.length} quotes for BRL corridor`);
    return quotes;
  }
}

/**
 * Example OTC provider for MXN → USD corridor
 */
@Injectable()
export class MxnUsdOtcProvider implements OtcQuoteProvider {
  private readonly logger = new Logger(MxnUsdOtcProvider.name);
  readonly venueId = "otc:mxn-usd:provider1";

  async fetchQuotes(): Promise<OTCQuote[]> {
    const now = Date.now();
    const quotes: OTCQuote[] = [
      {
        venueId: this.venueId,
        fromToken: "MXN",
        toToken: "USD",
        amountIn: 1000,
        amountOut: 58, // ~0.058 USD per MXN
        maxAmountIn: 50000,
        feeBps: 60, // 0.6%
        expiry: now + 30000,
        depositAddress: "0xabcdef1234567890...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 1, // Next day settlement for SPEI
          counterpartyRisk: 0.001,
          supportsReservation: true,
          paymentMethods: ["SPEI", "bank_transfer"],
        },
      },
      {
        venueId: this.venueId,
        fromToken: "MXN",
        toToken: "USDT",
        amountIn: 1000,
        amountOut: 58.5,
        maxAmountIn: 50000,
        feeBps: 50,
        expiry: now + 30000,
        depositAddress: "0xabcdef1234567890...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 1,
          counterpartyRisk: 0.001,
          supportsReservation: true,
          paymentMethods: ["SPEI"],
        },
      },
    ];

    this.logger.log(`Fetched ${quotes.length} quotes for MXN corridor`);
    return quotes;
  }
}

/**
 * Example OTC provider for NGN → EUR corridor
 */
@Injectable()
export class NgnEurOtcProvider implements OtcQuoteProvider {
  private readonly logger = new Logger(NgnEurOtcProvider.name);
  readonly venueId = "otc:ngn-eur:provider1";

  async fetchQuotes(): Promise<OTCQuote[]> {
    const now = Date.now();
    const quotes: OTCQuote[] = [
      {
        venueId: this.venueId,
        fromToken: "NGN",
        toToken: "EUR",
        amountIn: 100000, // NGN typically has larger amounts
        amountOut: 100, // ~0.001 EUR per NGN
        maxAmountIn: 10000000,
        feeBps: 80, // 0.8%
        expiry: now + 30000,
        depositAddress: "0x9876543210fedcba...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 2, // 2 days for NGN (higher friction)
          counterpartyRisk: 0.002, // 0.2% (higher risk)
          supportsReservation: false, // Manual process
          paymentMethods: ["bank_transfer"],
        },
      },
      {
        venueId: this.venueId,
        fromToken: "NGN",
        toToken: "USDC",
        amountIn: 100000,
        amountOut: 110,
        maxAmountIn: 10000000,
        feeBps: 70,
        expiry: now + 30000,
        depositAddress: "0x9876543210fedcba...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 2,
          counterpartyRisk: 0.002,
          supportsReservation: false,
          paymentMethods: ["bank_transfer"],
        },
      },
    ];

    this.logger.log(`Fetched ${quotes.length} quotes for NGN corridor`);
    return quotes;
  }
}

/**
 * Generic EUR/USD/USDC intermediary provider
 * Provides quotes for stablecoin pairs (USDC → EUR, USDT → EUR, etc.)
 */
@Injectable()
export class StablecoinIntermediaryProvider implements OtcQuoteProvider {
  private readonly logger = new Logger(StablecoinIntermediaryProvider.name);
  readonly venueId = "otc:stablecoin:provider1";

  async fetchQuotes(): Promise<OTCQuote[]> {
    const now = Date.now();
    const quotes: OTCQuote[] = [
      // USDC → EUR (off-ramp)
      {
        venueId: this.venueId,
        fromToken: "USDC",
        toToken: "EUR",
        amountIn: 1000,
        amountOut: 920, // ~0.92 EUR per USDC
        maxAmountIn: 1000000,
        feeBps: 30,
        expiry: now + 30000,
        depositAddress: "0x1111111111111111...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1, // Near-instant for stablecoins
          counterpartyRisk: 0.0005, // 0.05% (very low)
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
      // USDT → EUR (alternative off-ramp)
      {
        venueId: this.venueId,
        fromToken: "USDT",
        toToken: "EUR",
        amountIn: 1000,
        amountOut: 918, // Slightly worse: 0.918 vs 0.92
        maxAmountIn: 1000000,
        feeBps: 35,
        expiry: now + 30000,
        depositAddress: "0x2222222222222222...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1,
          counterpartyRisk: 0.0005,
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
      // EURC → EUR (off-ramp from EUR stablecoin)
      {
        venueId: this.venueId,
        fromToken: "EURC",
        toToken: "EUR",
        amountIn: 1000,
        amountOut: 998, // Best rate: 0.998 (near 1:1)
        maxAmountIn: 1000000,
        feeBps: 20, // Lowest fee for EURC → EUR
        expiry: now + 30000,
        depositAddress: "0x3333333333333333...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1,
          counterpartyRisk: 0.0005,
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
      // USDC → EURC (on-ramp to EUR stablecoin, alternative to DEX)
      {
        venueId: this.venueId,
        fromToken: "USDC",
        toToken: "EURC",
        amountIn: 1000,
        amountOut: 912, // ~0.912 EURC per USDC (worse than DEX)
        maxAmountIn: 1000000,
        feeBps: 35, // Higher fee than DEX
        expiry: now + 30000,
        depositAddress: "0x4444444444444444...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1,
          counterpartyRisk: 0.0005,
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
      // USDT → EUR
      {
        venueId: this.venueId,
        fromToken: "USDT",
        toToken: "EUR",
        amountIn: 1000,
        amountOut: 918,
        maxAmountIn: 1000000,
        feeBps: 35,
        expiry: now + 30000,
        depositAddress: "0x2222222222222222...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1,
          counterpartyRisk: 0.0005,
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
      // USDC → USD (1:1 typically)
      {
        venueId: this.venueId,
        fromToken: "USDC",
        toToken: "USD",
        amountIn: 1000,
        amountOut: 999,
        maxAmountIn: 1000000,
        feeBps: 10,
        expiry: now + 30000,
        depositAddress: "0x3333333333333333...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1,
          counterpartyRisk: 0.0005,
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
      // EURC → EUR (off-ramp from on-chain stablecoin to fiat)
      {
        venueId: this.venueId,
        fromToken: "EURC",
        toToken: "EUR",
        amountIn: 1000,
        amountOut: 998,
        maxAmountIn: 1000000,
        feeBps: 20,
        expiry: now + 30000,
        depositAddress: "0x4444444444444444...",
        lastUpdated: now,
        settlementMeta: {
          settlementDays: 0.1,
          counterpartyRisk: 0.0005,
          supportsReservation: true,
          paymentMethods: ["on_chain"],
        },
      },
    ];

    this.logger.log(`Fetched ${quotes.length} stablecoin intermediary quotes`);
    return quotes;
  }
}
