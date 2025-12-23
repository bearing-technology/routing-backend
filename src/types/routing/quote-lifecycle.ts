import { RouteResult } from "./route";

export enum QuoteStatus {
  PROVISIONAL = "PROVISIONAL",
  RESERVED = "RESERVED",
  PENDING_DEPOSIT = "PENDING_DEPOSIT",
  DEPOSIT_CONFIRMED = "DEPOSIT_CONFIRMED",
  EXECUTING = "EXECUTING",
  SETTLED = "SETTLED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

export interface ProvisionalQuote {
  quoteId: string;
  route: RouteResult | null;
  amountIn: number;
  amountOut: number;
  netAmountOut: number; // After settlement risk discount
  feeBps: number;
  expiryTs: number;
  createdTs: number;
  scoringMeta: {
    settlementDays: number;
    counterpartyRisk: number;
    timePenalty: number;
    confidence: number;
  };
  type: "OTC" | "DEX" | "OTC+DEX";
}

export interface ReservedQuote extends ProvisionalQuote {
  reservationId: string;
  reservedByClient: string;
  reservedUntilTs: number;
  otcReservationMeta?: {
    otcReservationId?: string;
    depositAddress?: string;
    depositInstructions?: DepositInstructions;
  };
}

export interface DepositInstructions {
  /** Payment method: PIX, SPEI, bank transfer, etc. */
  method: string;
  /** Bank account details or PIX key */
  accountDetails: {
    bankName?: string;
    accountNumber?: string;
    pixKey?: string;
    iban?: string;
    routingNumber?: string;
  };
  /** Exact amount to deposit */
  amount: number;
  /** Unique payment reference that must be included */
  paymentReference: string;
  /** QR code data for PIX (if applicable) */
  qrCodeData?: string;
  /** Expiry for deposit */
  depositExpiryTs: number;
}

export interface DepositRecord {
  depositId: string;
  quoteId: string;
  clientId: string;
  amountExpected: number;
  amountReceived?: number;
  depositInstructions: DepositInstructions;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";
  receivedAt?: number;
  bankTxId?: string;
  paymentReference: string;
}
