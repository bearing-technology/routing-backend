import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { OtcQuoteProvider } from "../otc-quote.prefetcher";
import { OTCQuote } from "src/types/routing/quotes";
import axios from "axios";

interface AwesomeApiRate {
  code: string;
  codein: string;
  name: string;
  high: string;
  low: string;
  varBid: string;
  pctChange: string;
  bid: string;
  ask: string;
  timestamp: string;
  create_date: string;
}

type AwesomeApiResponse = Record<string, AwesomeApiRate>;

const awesomeApiQuoteCache: {
  lastQuotes: OTCQuote[];
  lastFetchedTimestamp: number;
} = {
  lastQuotes: [],
  lastFetchedTimestamp: 0,
};

@Injectable()
export class BrlProvider implements OtcQuoteProvider, OnModuleInit {
  private readonly logger = new Logger(BrlProvider.name);
  readonly venueId = "fx:awesomeapi-brl";

  // AwesomeAPI FX endpoint, supports multiple pairs in a single request:
  // e.g. https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,EUR-USD
  private readonly baseUrl = "https://economia.awesomeapi.com.br/last";

  // Pairs as provided by AwesomeAPI: USD-BRL, EUR-BRL, EUR-USD
  private readonly currencyPairs: Array<{
    from: string;
    to: string;
  }> = [
    { from: "USD", to: "BRL" },
    { from: "EUR", to: "BRL" },
    { from: "EUR", to: "USD" },
  ];

  constructor() {
    // AwesomeAPI public FX endpoint does not require an API key
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.fetchQuotes();
      this.logger.log("Prefetched AwesomeAPI BRL quotes on module init");
    } catch (error: any) {
      this.logger.error(
        `Failed to prefetch AwesomeAPI BRL quotes on module init: ${
          error?.message ?? error
        }`,
      );
    }
  }

  async fetchQuotes(): Promise<OTCQuote[]> {
    const quotes: OTCQuote[] = [];
    const fetched: Record<
      string,
      {
        ask: number;
        bid: number;
        mid: number;
        lastRefreshed: number;
        settlementMeta: OTCQuote["settlementMeta"];
      }
    > = {};
    const now = Date.now();

    let failed = false;

    try {
      // Build combined path: USD-BRL,EUR-BRL,EUR-USD
      const pairPaths = this.currencyPairs
        .map((pair) => `${pair.from}-${pair.to}`)
        .join(",");

      this.logger.error(pairPaths);

      const response = await axios.get<AwesomeApiResponse>(
        `${this.baseUrl}/${pairPaths}`,
        {
          timeout: 5000, // 5s timeout
        },
      );

      const data = response.data;
      this.logger.error(data);

      for (const pair of this.currencyPairs) {
        const pairKey = `${pair.from}${pair.to}`; // e.g. USDBRL, EURBRL, EURUSD
        const rate = data[pairKey];

        if (!rate) {
          this.logger.warn(
            `No AwesomeAPI rate data for ${pair.from} → ${pair.to}`,
          );
          failed = true;
          continue;
        }

        const askPrice = parseFloat(rate.ask);
        const bidPrice = parseFloat(rate.bid);

        if (isNaN(askPrice) || isNaN(bidPrice)) {
          this.logger.error(
            `Invalid AwesomeAPI price data for ${pair.from} → ${pair.to}`,
          );
          failed = true;
          continue;
        }

        const midPrice = (askPrice + bidPrice) / 2;
        const lastRefreshedStr = rate.create_date;
        const lastRefreshed = this.parseTimestamp(lastRefreshedStr);

        const spread = ((askPrice - bidPrice) / midPrice) * 10000;

        const standardAmountIn = 1;
        const amountOut = askPrice;

        const expiry = now + 60000;

        const settlementMeta = this.getSettlementMeta(pair.from, pair.to);

        const quote: OTCQuote = {
          venueId: this.venueId,
          fromToken: pair.from,
          toToken: pair.to,
          amountIn: standardAmountIn,
          amountOut: amountOut,

          feeBps: Math.round(spread / 2),
          expiry: expiry,
          lastUpdated: lastRefreshed || now,
          settlementMeta: settlementMeta,
        };

        quotes.push(quote);

        const rateKey = `${pair.from}-${pair.to}`;
        fetched[rateKey] = {
          ask: quote.amountOut,
          bid:
            quote.feeBps !== undefined
              ? quote.amountOut - (quote.amountOut * (quote.feeBps * 2)) / 10000
              : quote.amountOut,
          mid: quote.amountOut,
          lastRefreshed: quote.lastUpdated,
          settlementMeta: quote.settlementMeta,
        };
      }
    } catch (error: any) {
      failed = true;
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          this.logger.warn(
            "Timeout fetching BRL rates from AwesomeAPI (batched request)",
          );
        } else if (error.response?.status === 429) {
          this.logger.warn(
            "Received 429 rate limit from AwesomeAPI for BRL batch request",
          );
        } else {
          this.logger.error(
            `HTTP error fetching BRL rates from AwesomeAPI: ${error.message}`,
          );
        }
      } else {
        this.logger.error(
          `Unexpected error fetching BRL rates from AwesomeAPI: ${
            error?.message ?? error
          }`,
        );
      }
    }

    Object.keys(fetched).forEach((key) => {
      const [from, to] = key.split("-");
      const invertedKey = `${to}-${from}`;

      if (fetched[invertedKey]) return;

      const data = fetched[key];
      const invAsk = data.bid > 0 ? 1 / data.bid : 0;
      const invBid = data.ask > 0 ? 1 / data.ask : 0;
      if (invAsk <= 0 || invBid <= 0) return;

      const invMid = 1 / data.mid;
      const invSpread = ((invAsk - invBid) / invMid) * 10000;

      const quote: OTCQuote = {
        venueId: this.venueId,
        fromToken: to,
        toToken: from,
        amountIn: 1,
        amountOut: invAsk,
        feeBps: Math.max(0, Math.round(invSpread / 2)),
        expiry: now + 60000,
        lastUpdated: data.lastRefreshed || now,
        settlementMeta: this.getSettlementMeta(to, from),
      };

      quotes.push(quote);
    });

    // Always update cache with any quotes we successfully fetched, even on partial failures
    // This ensures we preserve quotes even if some pairs fail
    if (quotes.length > 0) {
      // Merge with cached quotes: prefer new quotes, fall back to cached for missing pairs
      const quoteMap = new Map<string, OTCQuote>();

      // First, add all cached quotes
      awesomeApiQuoteCache.lastQuotes.forEach((quote) => {
        const key = `${quote.fromToken}-${quote.toToken}`;
        quoteMap.set(key, quote);
      });

      // Then, overwrite with any new quotes we just fetched
      quotes.forEach((quote) => {
        const key = `${quote.fromToken}-${quote.toToken}`;
        quoteMap.set(key, quote);
      });

      // Update cache with merged quotes
      awesomeApiQuoteCache.lastQuotes = Array.from(quoteMap.values());
      awesomeApiQuoteCache.lastFetchedTimestamp = Date.now();

      if (quotes.length === this.currencyPairs.length * 2) {
        // Complete success
        this.logger.log(
          `Fetched ${quotes.length} quotes from AwesomeAPI BRL (all pairs)`,
        );
        return quotes;
      } else if (failed) {
        // Partial failure - return merged quotes
        const mergedQuotes = Array.from(quoteMap.values());
        this.logger.warn(
          `Partial fetch from AwesomeAPI BRL: got ${quotes.length} new quotes, ${mergedQuotes.length} total (merged with cache)`,
        );
        return mergedQuotes;
      } else {
        // Some quotes but no failures (might be rate limited)
        this.logger.log(
          `Fetched ${quotes.length}/${
            this.currencyPairs.length * 2
          } quotes from AwesomeAPI BRL`,
        );
        return quotes;
      }
    } else if (awesomeApiQuoteCache.lastQuotes.length > 0) {
      // Complete failure but we have cached quotes
      this.logger.warn(
        `AwesomeAPI BRL fetch failed completely. Using cached quotes from ${new Date(
          awesomeApiQuoteCache.lastFetchedTimestamp,
        ).toISOString()} (${awesomeApiQuoteCache.lastQuotes.length} pairs)`,
      );
      return awesomeApiQuoteCache.lastQuotes;
    } else {
      // Complete failure and no cache
      this.logger.error(
        "Could not fetch AwesomeAPI BRL quotes and no previous quotes in cache.",
      );
      return [];
    }
  }

  private parseTimestamp(timestampStr: string): number {
    try {
      const date = new Date(timestampStr + " UTC");
      return date.getTime();
    } catch (error) {
      this.logger.warn(`Failed to parse timestamp: ${timestampStr}`);
      return Date.now();
    }
  }

  private getSettlementMeta(
    fromCurrency: string,
    toCurrency: string,
  ): OTCQuote["settlementMeta"] {
    // FX settlement is typically T+0 or T+1
    const isStablecoin =
      ["USDC", "USDT", "EURC"].includes(fromCurrency) ||
      ["USDC", "USDT", "EURC"].includes(toCurrency);

    if (isStablecoin) {
      return {
        settlementDays: 0.5,
        counterpartyRisk: 0.0001,
        supportsReservation: false,
        paymentMethods: ["bank_transfer"],
      };
    }

    const isEmergingMarket =
      ["BRL", "MXN", "NGN"].includes(fromCurrency) ||
      ["BRL", "MXN", "NGN"].includes(toCurrency);

    return {
      settlementDays: isEmergingMarket ? 1 : 0.5, // T+1 for emerging markets
      counterpartyRisk: isEmergingMarket ? 0.001 : 0.0005, // Higher risk for emerging markets
      supportsReservation: false,
      paymentMethods: ["bank_transfer", "wire_transfer"],
    };
  }
}
