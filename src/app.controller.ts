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
    private readonly otpService: OtpService
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /*@Post("/auth/requestCode")
  async sendEmail(@Body() sendEmailRequest: SendCodeRequest) {
    try {
      if (!sendEmailRequest?.email) {
        throw new BadRequestException("email is required");
      }

      const { code, expiresAt } = await this.otpService.createAndStoreOtp({
        recipient: sendEmailRequest.email,
      });

      const result = await this.mailService.sendCustomEmail(
        sendEmailRequest.email,
        code
      );
      if (result) {
        return {
          success: true,
          message: "Code sent successfully",
          expiresAt,
        };
      } else {
        return {
          success: false,
          message: "Code request failed",
        };
      }
    } catch (error) {
      console.error("Code sending failed:", error);
      return {
        success: false,
        message: "Code request failed",
      };
    }
  }

  @Post("/api/contact")
  async sendContactEmail(@Body() sendEmailRequest: SendCodeRequest) {
    try {
      if (!sendEmailRequest?.email) {
        throw new BadRequestException("email is required");
      }

      const { code, expiresAt } = await this.otpService.createAndStoreOtp({
        recipient: sendEmailRequest.email,
      });

      const result = await this.mailService.sendCustomEmail(
        sendEmailRequest.email,
        code
      );
      if (result) {
        return {
          success: true,
          message: "Code sent successfully",
          expiresAt,
        };
      } else {
        return {
          success: false,
          message: "Code request failed",
        };
      }
    } catch (error) {
      console.error("Code sending failed:", error);
      return {
        success: false,
        message: "Code request failed",
      };
    }
  }

  @Post("/auth/status")
  async checkStatus(@Body() checkStatusRequest: CheckStatusRequest) {
    try {
      if (!checkStatusRequest?.email && !checkStatusRequest.wallet) {
        throw new BadRequestException(
          "Email or wallet is required to check status."
        );
      }

      let query = `SELECT id, wallet, email, status FROM whitelist WHERE `;
      const params: (string | undefined)[] = [];
      const conditions: string[] = [];

      if (checkStatusRequest.email) {
        conditions.push(`email = $${params.length + 1}`);
        params.push(checkStatusRequest.email);
      }
      if (checkStatusRequest.wallet) {
        conditions.push(`wallet = $${params.length + 1}`);
        params.push(checkStatusRequest.wallet);
      }

      query += conditions.join(" OR ");

      const { rows } = await pool.query(query, params);

      if (rows.length === 0) {
        return {
          approved: false,
        };
      }

      const status = rows[0].status;
      console.log(status);

      return {
        approved: status,
      };
    } catch (error) {
      console.error("Whitelist status check failed:", error);
      return {
        approved: false,
        message: "Internal server error",
      };
    }
  }

  @Post("/auth/verify")
  async verify(@Body() verifyRequest: VerifyCodeRequest) {
    try {
      if (!verifyRequest?.email || !verifyRequest?.code) {
        throw new BadRequestException("email and code are required");
      }

      const verification = await this.otpService.verifyAndConsume({
        recipient: verifyRequest.email,
        code: verifyRequest.code,
      });

      return {
        success: verification.valid,
        reason: verification.reason,
      };
    } catch (error) {
      console.error("Verification failed:", error);
      return {
        success: false,
        message: "Verification failed",
        error: error.message,
      };
    }
  }*/
}
