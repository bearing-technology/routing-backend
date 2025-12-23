export interface RouteNode {
  id: string;
  chainId: number;
  symbol: string;
}

export interface RouteEdge {
  from: string;
  to: string;
  venueId: string;
  chainId: number;
  price: number;
  feeBps: number;
  liquidity: number;
  cost: number;
  lastUpdated: number;
}

export interface RoutingGraphSnapshot {
  nodes: RouteNode[];
  edges: RouteEdge[];
  timestamp: number;
}
