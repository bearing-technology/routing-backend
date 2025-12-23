import { RouteResult } from "src/types/routing/route";

export class QuoteResponse {
  route: RouteResult | null;
  quoteId: string;
  expiresAt: number;
  consideredQuotes: number;
  fallbackRoutes?: RouteResult[];
}
