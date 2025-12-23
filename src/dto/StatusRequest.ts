import { IsString } from "class-validator";

export class StatusRequest {
  @IsString()
  executionId: string;
}

