import { DynamicModule, Module } from "@nestjs/common";
import {
  OTC_QUOTE_PROVIDERS,
  OtcQuotePrefetcher,
  OtcQuoteProvider,
} from "./otc-quote.prefetcher";
import { OtcRoutingService } from "./otc-routing.service";
import { ExecutionService } from "./execution.service";
import { RoutingController } from "./routing.controller";
import { QuoteRefreshCron } from "./quote-refresh.cron";
import { QuoteLifecycleService } from "./quote-lifecycle.service";
import { DepositService } from "./deposit.service";
import { SettlementScoringService } from "./settlement-scoring.service";
import { AlphaVantageProvider } from "./providers/alphavantage.provider";
import { BrlProvider } from "./providers/brlprovider";

@Module({
  providers: [
    OtcRoutingService,
    OtcQuotePrefetcher,
    ExecutionService,
    QuoteLifecycleService,
    DepositService,
    SettlementScoringService,
    QuoteRefreshCron,
    { provide: OTC_QUOTE_PROVIDERS, useValue: [] },
  ],
  controllers: [RoutingController],
  exports: [
    OtcRoutingService,
    OtcQuotePrefetcher,
    ExecutionService,
    QuoteLifecycleService,
    DepositService,
    SettlementScoringService,
  ],
})
export class RoutingModule {
  static register(providers: OtcQuoteProvider[]): DynamicModule {
    // Find Alpha Vantage provider if present
    const alphaVantageProvider = providers.find(
      (p) => p.venueId === "fx:alphavantage",
    ) as AlphaVantageProvider | undefined;

    // Find BRL AwesomeAPI provider if present
    const brlProvider = providers.find(
      (p) => p.venueId === "fx:awesomeapi-brl",
    ) as BrlProvider | undefined;

    const moduleProviders: any[] = [
      OtcRoutingService,
      OtcQuotePrefetcher,
      ExecutionService,
      QuoteLifecycleService,
      DepositService,
      SettlementScoringService,
      QuoteRefreshCron,
      { provide: OTC_QUOTE_PROVIDERS, useValue: providers },
    ];

    // Add Alpha Vantage provider to module providers if found
    // This allows QuoteRefreshCron to inject it directly
    if (alphaVantageProvider) {
      moduleProviders.push({
        provide: AlphaVantageProvider,
        useValue: alphaVantageProvider,
      });
    }

    // Add BRL AwesomeAPI provider to module providers if found
    if (brlProvider) {
      moduleProviders.push({
        provide: BrlProvider,
        useValue: brlProvider,
      });
    }

    return {
      module: RoutingModule,
      providers: moduleProviders,
      controllers: [RoutingController],
      exports: [
        OtcRoutingService,
        OtcQuotePrefetcher,
        ExecutionService,
        QuoteLifecycleService,
        DepositService,
        SettlementScoringService,
      ],
    };
  }
}
