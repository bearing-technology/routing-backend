export type VenueType = "OTC" | "CEX" | "DEX";

export interface VenueHealth {
  online: boolean;
  lastPingMs: number;
  latencyMs: number;
  errorRate: number;
  lastUpdated: number;
}

export interface Venue {
  venueId: string;
  type: VenueType;
  chainId?: number;
  name: string;
  health: VenueHealth;
}
