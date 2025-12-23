export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeToken: string;
  blockTimeMs: number;
  finalityBlocks: number;
}
