import { Injectable, Logger } from "@nestjs/common";
import { Redis } from "src/config/redis";
import { RedisKey } from "src/types/routing/redis";
import { OTCQuote } from "src/types/routing/quotes";
import { RouteResult, RouteStep } from "src/types/routing/route";

type MaybeQuote = OTCQuote | null;

interface BestRouteRequest {
  amountIn: number;
  fromToken: string;
  toToken: string;
  /** Optional intermediates to consider, e.g. ["EURC", "USDC"] */
  intermediates?: string[];
  /** Minimum remaining validity in ms a quote must have to be considered */
  minExpiryMs?: number;
}

interface BestRouteResponse {
  route: RouteResult | null;
  consideredQuotes: number;
}

@Injectable()
export class OtcRoutingService {
  private readonly logger = new Logger(OtcRoutingService.name);
  private static readonly MIN_TTL_MS = 1000; // keep at least 1s TTL to avoid immediate expiry

  /**
   * Cache a single quote (OTC or DEX) with TTL derived from its expiry.
   */
  async cacheQuote(quote: OTCQuote): Promise<void> {
    const ttlMs = Math.max(
      OtcRoutingService.MIN_TTL_MS,
      quote.expiry - Date.now(),
    );

    // Use different key pattern for DEX vs OTC
    let key: string;
    if (quote.venueId.startsWith("dex:")) {
      // DEX quotes stored as routing edges
      key = RedisKey.routingEdge(
        "solana",
        quote.fromToken,
        quote.toToken,
        quote.venueId,
      );
    } else {
      // OTC quotes use the standard pattern
      key = RedisKey.otcQuote(quote.fromToken, quote.toToken, quote.venueId);
    }

    await Redis.set(key, JSON.stringify(quote), "PX", ttlMs);
  }

  /**
   * Cache a batch of quotes (OTC and DEX). TTL is taken from each quote's expiry.
   */
  async cacheQuotes(quotes: OTCQuote[]): Promise<void> {
    const pipeline = Redis.pipeline();
    const now = Date.now();

    quotes.forEach((quote) => {
      const ttlMs = Math.max(OtcRoutingService.MIN_TTL_MS, quote.expiry - now);

      // Use different key pattern for DEX vs OTC
      let key: string;
      if (quote.venueId.startsWith("dex:")) {
        // DEX quotes stored as routing edges
        key = RedisKey.routingEdge(
          "solana",
          quote.fromToken,
          quote.toToken,
          quote.venueId,
        );
      } else {
        // OTC quotes use the standard pattern
        key = RedisKey.otcQuote(quote.fromToken, quote.toToken, quote.venueId);
      }

      pipeline.set(key, JSON.stringify(quote), "PX", ttlMs);
    });

    await pipeline.exec();
  }

  /**
   * Return the best route (1-hop, 2-hop, or 3-hop) based on cached quotes from both OTC and DEX.
   * Pathfinding compares all available routes including:
   * - Direct routes (1-hop)
   * - Routes via single intermediary (2-hop)
   * - Routes via multiple intermediaries (3-hop): e.g., BRL → USDC (OTC) → EURC (DEX) → EUR (OTC)
   * Selects the route with maximum output amount.
   */
  async getBestRoute({
    amountIn,
    fromToken,
    toToken,
    intermediates = [],
    minExpiryMs = 0,
  }: BestRouteRequest): Promise<BestRouteResponse> {
    try {
      this.bestRoute = null;
      const consideredQuotes: MaybeQuote[] = [];
      const now = Date.now();
      const expiryGuard = now + minExpiryMs;

      // Common intermediaries to try if not specified
      const commonIntermediaries =
        intermediates.length > 0 ? intermediates : ["USDC", "USDT", "EURC"];

      // 1. Try direct route (1-hop)
      const oneHopQuotes = await this.loadQuotes(fromToken, toToken);
      consideredQuotes.push(...oneHopQuotes);

      // 2. Try routes via single intermediary (2-hop)
      // Load all intermediary pairs in parallel for better performance
      const twoHopPromises = commonIntermediaries
        .filter((mid) => mid !== fromToken && mid !== toToken)
        .map(async (mid) => {
          const [leg1, leg2] = await Promise.all([
            this.loadQuotes(fromToken, mid),
            this.loadQuotes(mid, toToken),
          ]);
          return { mid, leg1, leg2 };
        });

      const twoHopResults = await Promise.all(twoHopPromises);

      for (const { mid, leg1, leg2 } of twoHopResults) {
        consideredQuotes.push(...leg1, ...leg2);

        // Process routes more efficiently
        for (const q1 of leg1) {
          if (!q1) continue;
          if (q1.expiry <= expiryGuard) continue;
          if (q1.maxAmountIn && amountIn > q1.maxAmountIn) continue;

          const midOut = this.computeOutput(amountIn, q1);
          if (midOut <= 0) continue;

          for (const q2 of leg2) {
            if (!q2) continue;
            if (q2.expiry <= expiryGuard) continue;
            if (q2.maxAmountIn && midOut > q2.maxAmountIn) continue;

            const finalOut = this.computeOutput(midOut, q2);
            if (finalOut <= 0) continue;

            const route: RouteResult = {
              steps: [
                this.toRouteStep(q1, amountIn, midOut),
                this.toRouteStep(q2, midOut, finalOut),
              ],
              totalIn: amountIn,
              totalOut: finalOut,
              effectiveRate: finalOut / amountIn,
              totalFeesBps: (q1.feeBps ?? 0) + (q2.feeBps ?? 0),
              confidence: 1,
              timestamp: now,
            };

            this.updateBest(route);
          }
        }
      }

      // 3. Try routes via two intermediaries (3-hop): e.g., BRL → USDC → EURC → EUR
      // Limit to 2 intermediaries for performance (3-hop routes are less common)
      const limitedIntermediaries = commonIntermediaries.slice(0, 2);
      for (const mid1 of limitedIntermediaries) {
        if (mid1 === fromToken || mid1 === toToken) continue;

        for (const mid2 of limitedIntermediaries) {
          if (mid2 === fromToken || mid2 === toToken || mid2 === mid1) continue;

          // Load all legs in parallel for better performance
          const [leg1, leg2, leg3] = await Promise.all([
            this.loadQuotes(fromToken, mid1),
            this.loadQuotes(mid1, mid2),
            this.loadQuotes(mid2, toToken),
          ]);
          consideredQuotes.push(...leg1, ...leg2, ...leg3);

          // Process 3-hop routes more efficiently
          for (const q1 of leg1) {
            if (!q1) continue;
            if (q1.expiry <= expiryGuard) continue;
            if (q1.maxAmountIn && amountIn > q1.maxAmountIn) continue;

            const mid1Out = this.computeOutput(amountIn, q1);
            if (mid1Out <= 0) continue;

            for (const q2 of leg2) {
              if (!q2) continue;
              if (q2.expiry <= expiryGuard) continue;
              if (q2.maxAmountIn && mid1Out > q2.maxAmountIn) continue;

              const mid2Out = this.computeOutput(mid1Out, q2);
              if (mid2Out <= 0) continue;

              for (const q3 of leg3) {
                if (!q3) continue;
                if (q3.expiry <= expiryGuard) continue;
                if (q3.maxAmountIn && mid2Out > q3.maxAmountIn) continue;

                const finalOut = this.computeOutput(mid2Out, q3);
                if (finalOut <= 0) continue;

                const route: RouteResult = {
                  steps: [
                    this.toRouteStep(q1, amountIn, mid1Out),
                    this.toRouteStep(q2, mid1Out, mid2Out),
                    this.toRouteStep(q3, mid2Out, finalOut),
                  ],
                  totalIn: amountIn,
                  totalOut: finalOut,
                  effectiveRate: finalOut / amountIn,
                  totalFeesBps:
                    (q1.feeBps ?? 0) + (q2.feeBps ?? 0) + (q3.feeBps ?? 0),
                  confidence: 1,
                  timestamp: now,
                };

                this.updateBest(route);
              }
            }
          }
        }
      }

      // Evaluate 1-hop after two-hop to prefer the best overall
      oneHopQuotes.forEach((quote) => {
        if (!quote) return;
        if (quote.expiry <= expiryGuard) return;
        if (quote.maxAmountIn && amountIn > quote.maxAmountIn) return;

        const out = this.computeOutput(amountIn, quote);
        if (out <= 0) return;

        const route: RouteResult = {
          steps: [this.toRouteStep(quote, amountIn, out)],
          totalIn: amountIn,
          totalOut: out,
          effectiveRate: out / amountIn,
          totalFeesBps: quote.feeBps ?? 0,
          confidence: 1,
          timestamp: now,
        };

        this.updateBest(route);
      });

      return {
        route: this.bestRoute,
        consideredQuotes: consideredQuotes.filter(Boolean).length,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get best route: ${error?.message}`,
        error?.stack,
      );
      // Always return an object, even on error
      return {
        route: null,
        consideredQuotes: 0,
      };
    }
  }

  private async loadQuotes(
    fromToken: string,
    toToken: string,
  ): Promise<MaybeQuote[]> {
    try {
      const allKeys: string[] = [];
      const otcPattern = RedisKey.otcQuote(fromToken, toToken, "*");
      const otcKeys = await this.scanKeys(otcPattern);
      allKeys.push(...otcKeys);

      const dexPattern = `routing:edge:solana:${fromToken}:${toToken}:dex:*`;
      const dexKeys = await this.scanKeys(dexPattern);
      allKeys.push(...dexKeys);

      if (!allKeys.length) return [];

      // 3. Batch fetch all quotes
      const raw = await Redis.mget(allKeys);

      return raw
        .map((v) => {
          if (!v) return null;
          try {
            return JSON.parse(v) as OTCQuote;
          } catch (err) {
            this.logger.warn(`Failed to parse quote value: ${err?.message}`);
            return null;
          }
        })
        .filter((q): q is OTCQuote => q !== null);
    } catch (error) {
      this.logger.error(`Failed to load quotes: ${error?.message}`);
      return [];
    }
  }

  /**
   * Scan Redis keys using SCAN command (non-blocking, better for production).
   * Falls back to KEYS if SCAN fails (e.g., in test environments).
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      let cursor = "0";

      do {
        const [nextCursor, foundKeys] = await Redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100, // Process 100 keys at a time
        );
        cursor = nextCursor;
        keys.push(...foundKeys);
      } while (cursor !== "0");

      return keys;
    } catch (error) {
      // Fallback to KEYS if SCAN is not available (e.g., some Redis versions)
      this.logger.warn(`SCAN failed, falling back to KEYS: ${error?.message}`);
      try {
        return await Redis.keys(pattern);
      } catch (keysError) {
        this.logger.error(`KEYS also failed: ${keysError?.message}`);
        return [];
      }
    }
  }
  private computeOutput(amountIn: number, quote: OTCQuote): number {
    if (!quote.amountIn || quote.amountIn <= 0) return 0;
    const rate = quote.amountOut / quote.amountIn;
    const gross = amountIn * rate;
    return quote.feeBps ? gross - (gross * quote.feeBps) / 10000 : gross;
  }

  /**
   * Public helper: return all cached quotes for a pair from Redis (OTC + DEX).
   * This is primarily for debugging/inspection and for GET /routing/quotes.
   */
  async getCachedQuotes(
    fromToken: string,
    toToken: string,
  ): Promise<OTCQuote[]> {
    const quotes = await this.loadQuotes(fromToken, toToken);
    // Filter out nulls defensively and ensure proper typing
    return quotes.filter((q): q is OTCQuote => q !== null);
  }

  private toRouteStep(
    quote: OTCQuote,
    amountIn: number,
    amountOut: number,
  ): RouteStep {
    return {
      fromToken: quote.fromToken,
      toToken: quote.toToken,
      venueId: quote.venueId,
      chainId: quote.venueId.startsWith("dex:") ? 101 : 0,
      amountIn,
      amountOut,
      feeBps: quote.feeBps ?? 0,
      estimatedDurationMs: quote.venueId.startsWith("dex:") ? 30000 : 0,
    };
  }

  // best route tracking
  private bestRoute: RouteResult | null = null;
  private updateBest(candidate: RouteResult) {
    if (!this.bestRoute || candidate.totalOut > this.bestRoute.totalOut) {
      this.bestRoute = candidate;
    }
  }
}
