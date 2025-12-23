import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Redis } from "src/config/redis";
import { RedisKey } from "src/types/routing/redis";
import {
  ProvisionalQuote,
  ReservedQuote,
  QuoteStatus,
} from "src/types/routing/quote-lifecycle";
import { RouteResult } from "src/types/routing/route";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class QuoteLifecycleService {
  private readonly logger = new Logger(QuoteLifecycleService.name);
  private static readonly PROVISIONAL_TTL_SEC = 15; // 15 seconds for provisional quotes
  private static readonly RESERVED_TTL_SEC = 300; // 5 minutes for reserved quotes

  /**
   * Store a provisional quote (not yet reserved)
   */
  async storeProvisionalQuote(
    route: RouteResult | null,
    amountIn: number,
    amountOut: number,
    netAmountOut: number,
    feeBps: number,
    scoringMeta: {
      settlementDays: number;
      counterpartyRisk: number;
      timePenalty: number;
      confidence: number;
    },
    type: "OTC" | "DEX" | "OTC+DEX"
  ): Promise<ProvisionalQuote> {
    const quoteId = `quote:${uuidv4()}`;
    const now = Date.now();
    const expiryTs = now + QuoteLifecycleService.PROVISIONAL_TTL_SEC * 1000;

    const quote: ProvisionalQuote = {
      quoteId,
      route,
      amountIn,
      amountOut,
      netAmountOut,
      feeBps,
      expiryTs,
      createdTs: now,
      scoringMeta,
      type,
    };

    await Redis.set(
      RedisKey.provisionalQuote(quoteId),
      JSON.stringify(quote),
      "EX",
      QuoteLifecycleService.PROVISIONAL_TTL_SEC
    );

    return quote;
  }

  /**
   * Get provisional quote
   */
  async getProvisionalQuote(
    quoteId: string
  ): Promise<ProvisionalQuote | null> {
    const raw = await Redis.get(RedisKey.provisionalQuote(quoteId));
    if (!raw) return null;

    try {
      const quote = JSON.parse(raw) as ProvisionalQuote;
      // Check if expired
      if (Date.now() >= quote.expiryTs) {
        return null;
      }
      return quote;
    } catch (err) {
      this.logger.error(
        `Failed to parse provisional quote ${quoteId}: ${err?.message}`
      );
      return null;
    }
  }

  /**
   * Reserve a provisional quote (convert to reserved)
   */
  async reserveQuote(
    quoteId: string,
    clientId: string,
    otcReservationMeta?: {
      otcReservationId?: string;
      depositAddress?: string;
    }
  ): Promise<ReservedQuote> {
    const provisional = await this.getProvisionalQuote(quoteId);
    if (!provisional) {
      throw new NotFoundException(
        `Provisional quote ${quoteId} not found or expired`
      );
    }

    const reservationId = `reservation:${uuidv4()}`;
    const now = Date.now();
    const reservedUntilTs = now + QuoteLifecycleService.RESERVED_TTL_SEC * 1000;

    const reserved: ReservedQuote = {
      ...provisional,
      reservationId,
      reservedByClient: clientId,
      reservedUntilTs,
      otcReservationMeta,
    };

    // Store as reserved quote
    await Redis.set(
      RedisKey.reservedQuote(quoteId),
      JSON.stringify(reserved),
      "EX",
      QuoteLifecycleService.RESERVED_TTL_SEC
    );

    // Remove provisional
    await Redis.del(RedisKey.provisionalQuote(quoteId));

    this.logger.log(
      `Quote ${quoteId} reserved by client ${clientId}, reservationId: ${reservationId}`
    );

    return reserved;
  }

  /**
   * Get reserved quote
   */
  async getReservedQuote(quoteId: string): Promise<ReservedQuote | null> {
    const raw = await Redis.get(RedisKey.reservedQuote(quoteId));
    if (!raw) return null;

    try {
      const quote = JSON.parse(raw) as ReservedQuote;
      // Check if expired
      if (Date.now() >= quote.reservedUntilTs) {
        await Redis.del(RedisKey.reservedQuote(quoteId));
        return null;
      }
      return quote;
    } catch (err) {
      this.logger.error(
        `Failed to parse reserved quote ${quoteId}: ${err?.message}`
      );
      return null;
    }
  }

  /**
   * Update reserved quote status
   */
  async updateReservedQuoteStatus(
    quoteId: string,
    status: QuoteStatus
  ): Promise<void> {
    const reserved = await this.getReservedQuote(quoteId);
    if (!reserved) {
      throw new NotFoundException(`Reserved quote ${quoteId} not found`);
    }

    // In production, you might want to store status separately
    // For MVP, we'll track it via execution service
    this.logger.log(`Quote ${quoteId} status updated to ${status}`);
  }
}

