import { IsString, IsOptional } from "class-validator";

export class ExecuteRequest {
  @IsString()
  quoteId: string;

  /** Optional approval token if manual approval is required */
  @IsOptional()
  @IsString()
  approvalToken?: string;
}

