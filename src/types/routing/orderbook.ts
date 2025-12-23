export interface OrderbookLevel {
  price: number;
  size: number;
}

export interface Orderbook {
  venueId: string;
  base: string;
  quote: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  lastUpdated: number;
}
