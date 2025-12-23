export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  isStable: boolean;
  logoURL?: string;
  liquidityScore?: number;
  volatilityScore?: number;
}
