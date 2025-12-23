import { IsString, IsNumber, IsOptional } from "class-validator";

export class DepositWebhookRequest {
  @IsString()
  paymentReference: string;

  @IsNumber()
  amountReceived: number;

  @IsOptional()
  @IsString()
  bankTxId?: string;

  @IsOptional()
  @IsString()
  source?: string; // "PIX", "SPEI", "bank_webhook", etc.
}

