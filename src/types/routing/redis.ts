export interface RedisKeys {
  tokenInfo: (address: string) => string;
  venueHealth: (venueId: string) => string;
  priceSnapshot: (venueId: string, pair: string) => string;
  routingGraph: () => string;
  orderbook: (venueId: string) => string;
  otcQuote: (fromToken: string, toToken: string, venueId: string) => string;
  /** Provisional quote (short TTL, not reserved) */
  provisionalQuote: (quoteId: string) => string;
  /** Reserved quote (has reservationId) */
  reservedQuote: (quoteId: string) => string;
  /** Deposit record */
  deposit: (depositId: string) => string;
  /** Routing edge cache */
  routingEdge: (
    chain: string,
    from: string,
    to: string,
    venue: string,
  ) => string;
}

export const RedisKey: RedisKeys = {
  tokenInfo: (addr) => `token:${addr}`,
  venueHealth: (v) => `venue:health:${v}`,
  priceSnapshot: (v, p) => `price:${v}:${p}`,
  routingGraph: () => `routing:graph`,
  orderbook: (v) => `orderbook:${v}`,
  otcQuote: (from, to, venue) => `otc:quotes:${from}:${to}:${venue}`,
  provisionalQuote: (id) => `quote:prov:${id}`,
  reservedQuote: (id) => `quote:reserved:${id}`,
  deposit: (id) => `deposit:${id}`,
  routingEdge: (chain, from, to, venue) =>
    `routing:edge:${chain}:${from}:${to}:${venue}`,
};
