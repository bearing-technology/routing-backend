import { Injectable, Logger } from "@nestjs/common";
import { RouteResult } from "src/types/routing/route";
import { OTCQuote } from "src/types/routing/quotes";

/**
 * Service for scoring routes with settlement delay and FX risk considerations
 */
@Injectable()
export class SettlementScoringService {
  private readonly logger = new Logger(SettlementScoringService.name);

  // Market volatility parameters (tune from historical data)
  private readonly volatilityParams: Record<string, number> = {
    "BRL/EUR": 0.005, // 0.5% daily volatility
    "MXN/USD": 0.004, // 0.4% daily volatility
    "NGN/EUR": 0.008, // 0.8% daily volatility (higher risk)
  };

  // Counterparty risk factors (0-1)
  private readonly counterpartyRisk: Record<string, number> = {
    "otc:brl-eur:provider1": 0.001, // 0.1%
    "otc:mxn-usd:provider1": 0.001,
    "otc:ngn-eur:provider1": 0.002, // 0.2% (higher risk for NGN)
    "otc:stablecoin:provider1": 0.0005, // 0.05% (lower risk for stablecoins)
  };

  /**
   * Calculate net EUR output after settlement risk discount
   */
  calculateNetOutput(
    quotedOutput: number,
    route: RouteResult,
    quotes: OTCQuote[]
  ): number {
    // Get settlement metadata from quotes
    const maxSettlementDays = Math.max(
      ...quotes.map((q) => q.settlementMeta?.settlementDays || 0)
    );

    const avgCounterpartyRisk = this.getAverageCounterpartyRisk(quotes);
    const volatility = this.getVolatilityForRoute(route);

    // Calculate time penalty
    const timePenalty = this.calculateTimePenalty(
      quotedOutput,
      maxSettlementDays,
      volatility
    );

    // Calculate counterparty risk discount
    const counterpartyDiscount = quotedOutput * avgCounterpartyRisk;

    // Net output = quoted - time penalty - counterparty risk
    const netOutput = quotedOutput - timePenalty - counterpartyDiscount;

    this.logger.debug(
      `Scoring: quoted=${quotedOutput}, settlementDays=${maxSettlementDays}, ` +
        `timePenalty=${timePenalty}, counterpartyDiscount=${counterpartyDiscount}, net=${netOutput}`
    );

    return Math.max(0, netOutput); // Ensure non-negative
  }

  /**
   * Calculate time penalty based on settlement delay and volatility
   */
  private calculateTimePenalty(
    quotedAmount: number,
    settlementDays: number,
    dailyVolatility: number
  ): number {
    if (settlementDays <= 0) return 0;

    // Formula: timePenalty = quotedAmount * dailyVolatility * sqrt(settlementDays) * riskFactor
    const riskFactor = 1.0; // Conservative factor
    const timePenalty =
      quotedAmount * dailyVolatility * Math.sqrt(settlementDays) * riskFactor;

    return timePenalty;
  }

  /**
   * Get average counterparty risk for all quotes in route
   */
  private getAverageCounterpartyRisk(quotes: OTCQuote[]): number {
    if (quotes.length === 0) return 0.001; // Default 0.1%

    const risks = quotes.map(
      (q) =>
        q.settlementMeta?.counterpartyRisk ||
        this.counterpartyRisk[q.venueId] ||
        0.001
    );

    return risks.reduce((a, b) => a + b, 0) / risks.length;
  }

  /**
   * Get volatility for route based on currency pair
   */
  private getVolatilityForRoute(route: RouteResult): number {
    if (route.steps.length === 0) return 0.005; // Default

    const fromToken = route.steps[0].fromToken;
    const toToken = route.steps[route.steps.length - 1].toToken;

    const pair = `${fromToken}/${toToken}`;
    return this.volatilityParams[pair] || 0.005; // Default 0.5%
  }

  /**
   * Get scoring metadata for a route
   */
  getScoringMetadata(
    route: RouteResult,
    quotes: OTCQuote[]
  ): {
    settlementDays: number;
    counterpartyRisk: number;
    timePenalty: number;
    confidence: number;
  } {
    const maxSettlementDays = Math.max(
      ...quotes.map((q) => q.settlementMeta?.settlementDays || 0),
      0
    );

    const avgCounterpartyRisk = this.getAverageCounterpartyRisk(quotes);
    const volatility = this.getVolatilityForRoute(route);

    const timePenalty = this.calculateTimePenalty(
      route.totalOut,
      maxSettlementDays,
      volatility
    );

    // Confidence based on settlement time and counterparty risk
    const confidence = Math.max(
      0,
      Math.min(1, 1 - maxSettlementDays * 0.1 - avgCounterpartyRisk * 10)
    );

    return {
      settlementDays: maxSettlementDays,
      counterpartyRisk: avgCounterpartyRisk,
      timePenalty,
      confidence: Math.max(0.5, confidence), // Minimum 50% confidence
    };
  }
}
