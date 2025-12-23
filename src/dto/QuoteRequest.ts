import { IsNumber, IsString, IsOptional, IsArray, Min } from "class-validator";

export class QuoteRequest {
  @IsNumber()
  @Min(0.01)
  amountIn: number;

  @IsString()
  fromToken: string;

  @IsString()
  toToken: string;

  /** Optional intermediates to consider, e.g. ["EURC", "USDC"] */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  intermediates?: string[];

  /** Minimum remaining validity in ms a quote must have to be considered */
  @IsOptional()
  @IsNumber()
  minExpiryMs?: number;
}
