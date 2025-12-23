import { IsNumber, IsString, IsOptional, IsArray, Min } from "class-validator";

export class FXQuoteRequest {
  @IsString()
  fromCurrency: string;

  @IsString()
  toCurrency: string;
}
