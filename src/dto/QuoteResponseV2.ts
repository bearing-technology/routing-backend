import { RouteResult } from "src/types/routing/route";
import { ProvisionalQuote } from "src/types/routing/quote-lifecycle";

export class QuoteResponseV2 {
  quotes: Array<{
    quoteId: string;
    route: RouteResult | null;
    amountOut: number;
    netAmountOut: number; // After settlement risk discount
    expiryTs: number;
    type: "OTC" | "DEX" | "OTC+DEX";
    confidence: number;
    scoringMeta: {
      settlementDays: number;
      counterpartyRisk: number;
      timePenalty: number;
    };
  }>;
}

