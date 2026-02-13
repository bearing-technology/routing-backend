import {
  BadRequestException,
  Controller,
  Get,
  Body,
  Post,
} from "@nestjs/common";
import { AppService } from "./app.service";
import { OtpService } from "./OtpService";
import { SendCodeRequest } from "./dto/SendCodeRequest";
import { VerifyCodeRequest } from "./dto/VerifyCodeRequest";
import { CheckStatusRequest } from "./dto/CheckStatusRequest";
import { pool } from "./config/postgres.config";

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly otpService: OtpService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
