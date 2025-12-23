export interface RouteStep {
  fromToken: string;
  toToken: string;
  venueId: string;
  chainId: number;
  amountIn: number;
  amountOut: number;
  feeBps: number;
  estimatedDurationMs: number;
}

export interface RouteResult {
  steps: RouteStep[];
  totalIn: number;
  totalOut: number;
  effectiveRate: number;
  totalFeesBps: number;
  confidence: number;
  timestamp: number;
}
