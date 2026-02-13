import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OtcQuotePrefetcher } from "./otc-quote.prefetcher";
import { AlphaVantageProvider } from "./providers/alphavantage.provider";
import { OtcRoutingService } from "./otc-routing.service";
import { BrlProvider } from "./providers/brlprovider";

/**
 * Cron job to refresh OTC quotes periodically
 * - Mock providers: Every 30 seconds (fast, no rate limits)
 * - Alpha Vantage: Every minute (respects API rate limits: 1 req/sec, 25/day free tier)
 */
@Injectable()
export class QuoteRefreshCron {
  private readonly logger = new Logger(QuoteRefreshCron.name);

  constructor(
    private readonly prefetcher: OtcQuotePrefetcher,
    private readonly routing: OtcRoutingService,
    @Optional()
    @Inject(AlphaVantageProvider)
    private readonly alphaVantageProvider?: AlphaVantageProvider,
    private readonly brlProvider?: BrlProvider,
  ) {}

  /**
   * Refresh Alpha Vantage FX quotes every minute
   * Fetches all configured currency pairs (BRL→USD, MXN→USD, NGN→EUR, etc.)
   * Provider handles rate limiting internally (1.2s delay between requests)
   */
  @Cron("0 */58 0-23 * * *")
  async refreshAlphaVantageQuotes() {
    // Refresh Alpha Vantage quotes if configured
    if (this.alphaVantageProvider) {
      try {
        this.logger.log("Refreshing Alpha Vantage currency pairs...");
        const quotes = await this.alphaVantageProvider.fetchQuotes();
        if (quotes.length > 0) {
          await this.routing.cacheQuotes(quotes);
          this.logger.log(
            `Successfully cached ${quotes.length} Alpha Vantage quotes`,
          );
        } else {
          this.logger.warn("No Alpha Vantage quotes fetched");
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to refresh Alpha Vantage quotes: ${error.message}`,
        );
      }
    }

    // Refresh BRL AwesomeAPI quotes if configured
    if (this.brlProvider) {
      try {
        this.logger.log("Refreshing BRL AwesomeAPI currency pairs...");
        const brlQuotes = await this.brlProvider.fetchQuotes();
        if (brlQuotes.length > 0) {
          await this.routing.cacheQuotes(brlQuotes);
          this.logger.log(
            `Successfully cached ${brlQuotes.length} BRL AwesomeAPI quotes`,
          );
        } else {
          this.logger.warn("No BRL AwesomeAPI quotes fetched");
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to refresh BRL AwesomeAPI quotes: ${error.message}`,
        );
      }
    }
  }

  /**
   * Refresh mock providers more frequently (every 30 seconds)
   * This keeps mock data fresh while Alpha Vantage runs every minute
   */
  @Cron("0 */58 0-23 * * *") // Every 58 minutes (max ~25x per day)
  async refreshMockQuotes() {
    try {
      // Access providers through the prefetcher's private field
      // Filter out Alpha Vantage to avoid duplicate refreshes
      const allProviders = (this.prefetcher as any)["providers"] || [];
      const mockProviders = allProviders.filter(
        (p: any) => p.venueId !== "fx:alphavantage",
      );

      if (mockProviders.length === 0) {
        return; // No mock providers to refresh
      }

      const tasks = mockProviders.map(async (provider: any) => {
        try {
          const quotes = await provider.fetchQuotes();
          if (!quotes.length) return;
          await this.routing.cacheQuotes(quotes);
        } catch (err: any) {
          this.logger.error(
            `Failed to refresh quotes for ${provider.venueId}: ${err?.message}`,
          );
        }
      });

      await Promise.all(tasks);
      this.logger.debug(`Refreshed ${mockProviders.length} mock provider(s)`);
    } catch (error: any) {
      this.logger.error(`Failed to refresh mock quotes: ${error.message}`);
    }
  }
}
