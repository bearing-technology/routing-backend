import { Injectable, Logger } from "@nestjs/common";
import { OtcQuoteProvider } from "../otc-quote.prefetcher";
import { OTCQuote } from "src/types/routing/quotes";
import axios from "axios";

interface AlphaVantageResponse {
  "Realtime Currency Exchange Rate"?: {
    "1. From_Currency Code": string;
    "2. From_Currency Name": string;
    "3. To_Currency Code": string;
    "4. To_Currency Name": string;
    "5. Exchange Rate": string;
    "6. Last Refreshed": string;
    "7. Time Zone": string;
    "8. Bid Price": string;
    "9. Ask Price": string;
  };
  "Error Message"?: string;
  Note?: string;
  Information?: string;
}

// A simple in-memory cache for the last good quotes, scoped per instance.
const alphaVantageQuoteCache: {
  lastQuotes: OTCQuote[];
  lastFetchedTimestamp: number;
} = {
  lastQuotes: [],
  lastFetchedTimestamp: 0,
};

@Injectable()
export class AlphaVantageProvider implements OtcQuoteProvider {
  private readonly logger = new Logger(AlphaVantageProvider.name);
  readonly venueId = "fx:alphavantage";

  private readonly apiKey: string;
  private readonly baseUrl = "https://www.alphavantage.co/query";
  private readonly rateLimitDelayMs = 1200;

  // Supported currency pairs for routing
  private readonly currencyPairs: Array<{
    from: string;
    to: string;
  }> = [
    { from: "BRL", to: "USD" },
    { from: "BRL", to: "EUR" },
    { from: "MXN", to: "USD" },
    { from: "MXN", to: "EUR" },
    { from: "NGN", to: "USD" },
    { from: "NGN", to: "EUR" },
    { from: "USD", to: "EUR" },
    { from: "EUR", to: "USD" },
  ];

  constructor() {
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || "QEOYNEKDUEHZTJ8X";
    if (!this.apiKey || this.apiKey === "demo") {
      this.logger.warn(
        "Alpha Vantage API key not configured. Using demo key (limited requests)."
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

    for (let i = 0; i < this.currencyPairs.length; i++) {
      const pair = this.currencyPairs[i];

      if (i > 0) {
        await this.delay(this.rateLimitDelayMs);
      }

      try {
        const quote = await this.fetchQuote(pair.from, pair.to, now);
        if (quote) {
          quotes.push(quote);
          const rateKey = `${pair.from}-${pair.to}`;
          fetched[rateKey] = {
            ask: quote.amountOut,
            bid:
              quote.feeBps !== undefined
                ? quote.amountOut -
                  (quote.amountOut * (quote.feeBps * 2)) / 10000
                : quote.amountOut,
            mid: quote.amountOut,
            lastRefreshed: quote.lastUpdated,
            settlementMeta: quote.settlementMeta,
          };
        }
      } catch (error) {
        this.logger.error(
          `Failed to fetch quote for ${pair.from} → ${pair.to}: ${error?.message}`
        );
        failed = true;
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
      alphaVantageQuoteCache.lastQuotes.forEach((quote) => {
        const key = `${quote.fromToken}-${quote.toToken}`;
        quoteMap.set(key, quote);
      });
      
      // Then, overwrite with any new quotes we just fetched
      quotes.forEach((quote) => {
        const key = `${quote.fromToken}-${quote.toToken}`;
        quoteMap.set(key, quote);
      });
      
      // Update cache with merged quotes
      alphaVantageQuoteCache.lastQuotes = Array.from(quoteMap.values());
      alphaVantageQuoteCache.lastFetchedTimestamp = Date.now();
      
      if (quotes.length === this.currencyPairs.length * 2) {
        // Complete success
        this.logger.log(
          `Fetched ${quotes.length} quotes from Alpha Vantage (all pairs)`
        );
        return quotes;
      } else if (failed) {
        // Partial failure - return merged quotes
        const mergedQuotes = Array.from(quoteMap.values());
        this.logger.warn(
          `Partial fetch: got ${quotes.length} new quotes, ${mergedQuotes.length} total (merged with cache)`
        );
        return mergedQuotes;
      } else {
        // Some quotes but no failures (might be rate limited)
        this.logger.log(
          `Fetched ${quotes.length}/${this.currencyPairs.length * 2} quotes from Alpha Vantage`
        );
        return quotes;
      }
    } else if (alphaVantageQuoteCache.lastQuotes.length > 0) {
      // Complete failure but we have cached quotes
      this.logger.warn(
        `Alpha Vantage fetch failed completely. Using cached quotes from ${new Date(
          alphaVantageQuoteCache.lastFetchedTimestamp
        ).toISOString()} (${alphaVantageQuoteCache.lastQuotes.length} pairs)`
      );
      return alphaVantageQuoteCache.lastQuotes;
    } else {
      // Complete failure and no cache
      this.logger.error(
        "Could not fetch Alpha Vantage quotes and no previous quotes in cache."
      );
      return [];
    }
  }

  private async fetchQuote(
    fromCurrency: string,
    toCurrency: string,
    timestamp: number
  ): Promise<OTCQuote | null> {
    try {
      const response = await axios.get<AlphaVantageResponse>(this.baseUrl, {
        params: {
          function: "CURRENCY_EXCHANGE_RATE",
          from_currency: fromCurrency,
          to_currency: toCurrency,
          apikey: this.apiKey,
        },
        timeout: 5000, // 5s timeout
      });

      const data = response.data;

      // Check for API errors
      if (data["Error Message"]) {
        this.logger.error(
          `Alpha Vantage error for ${fromCurrency} → ${toCurrency}: ${data["Error Message"]}`
        );
        return null;
      }

      if (data["Note"] || data["Information"]) {
        this.logger.warn(
          `Alpha Vantage rate limit or info: ${
            data["Note"] || data["Information"]
          }`
        );
      }

      const exchangeRate = data["Realtime Currency Exchange Rate"];
      if (!exchangeRate) {
        this.logger.warn(
          `No exchange rate data for ${fromCurrency} → ${toCurrency}`
        );
        return null;
      }

      const askPrice = parseFloat(exchangeRate["9. Ask Price"]);
      const bidPrice = parseFloat(exchangeRate["8. Bid Price"]);
      const midPrice = parseFloat(exchangeRate["5. Exchange Rate"]);

      if (isNaN(askPrice) || isNaN(bidPrice) || isNaN(midPrice)) {
        this.logger.error(
          `Invalid price data for ${fromCurrency} → ${toCurrency}`
        );
        return null;
      }

      const lastRefreshedStr = exchangeRate["6. Last Refreshed"];
      const lastRefreshed = this.parseTimestamp(lastRefreshedStr);

      const spread = ((askPrice - bidPrice) / midPrice) * 10000;

      const standardAmountIn = 1;
      const amountOut = askPrice;

      const expiry = timestamp + 60000;

      const settlementMeta = this.getSettlementMeta(fromCurrency, toCurrency);

      const quote: OTCQuote = {
        venueId: this.venueId,
        fromToken: fromCurrency,
        toToken: toCurrency,
        amountIn: standardAmountIn,
        amountOut: amountOut,

        feeBps: Math.round(spread / 2),
        expiry: expiry,
        lastUpdated: lastRefreshed || timestamp,
        settlementMeta: settlementMeta,
      };

      return quote;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          this.logger.warn(
            `Timeout fetching ${fromCurrency} → ${toCurrency} from Alpha Vantage`
          );
        } else {
          this.logger.error(
            `HTTP error fetching ${fromCurrency} → ${toCurrency}: ${error.message}`
          );
        }
      } else {
        this.logger.error(
          `Unexpected error fetching ${fromCurrency} → ${toCurrency}: ${error?.message}`
        );
      }
      return null;
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
    toCurrency: string
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
