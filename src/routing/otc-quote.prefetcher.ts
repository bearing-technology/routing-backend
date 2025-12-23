import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { OtcRoutingService } from "./otc-routing.service";
import { OTCQuote } from "src/types/routing/quotes";

export interface OtcQuoteProvider {
  venueId: string;
  fetchQuotes(): Promise<OTCQuote[]>;
}

export const OTC_QUOTE_PROVIDERS = "OTC_QUOTE_PROVIDERS";

@Injectable()
export class OtcQuotePrefetcher {
  private readonly logger = new Logger(OtcQuotePrefetcher.name);

  constructor(
    private readonly routing: OtcRoutingService,
    @Optional()
    @Inject(OTC_QUOTE_PROVIDERS)
    private readonly providers: OtcQuoteProvider[] = []
  ) {}

  /**
   * Fetch quotes from all configured providers and cache them in Redis.
   * Intended to be called from a scheduler/cron in the application layer.
   */
  async refreshAll(): Promise<void> {
    if (!this.providers.length) {
      this.logger.warn("No OTC quote providers configured");
      return;
    }

    const tasks = this.providers.map(async (provider) => {
      try {
        const quotes = await provider.fetchQuotes();
        if (!quotes.length) return;
        await this.routing.cacheQuotes(quotes);
      } catch (err) {
        this.logger.error(
          `Failed to refresh quotes for ${provider.venueId}: ${err?.message}`
        );
      }
    });

    await Promise.all(tasks);
  }
}
