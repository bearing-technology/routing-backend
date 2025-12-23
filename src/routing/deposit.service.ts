import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Redis } from "src/config/redis";
import { RedisKey } from "src/types/routing/redis";
import {
  DepositRecord,
  DepositInstructions,
  ReservedQuote,
} from "src/types/routing/quote-lifecycle";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);
  private static readonly DEPOSIT_TTL_SEC = 3600; // 1 hour

  /**
   * Create deposit instructions for a reserved quote
   */
  async createDepositInstructions(
    quoteId: string,
    clientId: string,
    reservedQuote: ReservedQuote
  ): Promise<DepositInstructions> {
    const paymentRef = `r${reservedQuote.reservationId.substring(0, 8)}-${clientId.substring(0, 8)}`;
    const depositExpiryTs = reservedQuote.reservedUntilTs;

    // Determine payment method based on fromToken
    const method = this.getPaymentMethod(reservedQuote.route?.steps[0]?.fromToken || "");

    const instructions: DepositInstructions = {
      method,
      accountDetails: this.getAccountDetails(method, reservedQuote),
      amount: reservedQuote.amountIn,
      paymentReference: paymentRef,
      qrCodeData: method === "PIX" ? this.generatePixQrCode(paymentRef, reservedQuote.amountIn) : undefined,
      depositExpiryTs,
    };

    // Store deposit record
    const depositId = `deposit:${uuidv4()}`;
    const deposit: DepositRecord = {
      depositId,
      quoteId,
      clientId,
      amountExpected: reservedQuote.amountIn,
      depositInstructions: instructions,
      status: "PENDING",
      paymentReference: paymentRef,
    };

    await Redis.set(
      RedisKey.deposit(depositId),
      JSON.stringify(deposit),
      "EX",
      DepositService.DEPOSIT_TTL_SEC
    );

    // Also store by payment reference for webhook lookup
    await Redis.set(
      `deposit:ref:${paymentRef}`,
      depositId,
      "EX",
      DepositService.DEPOSIT_TTL_SEC
    );

    return instructions;
  }

  /**
   * Confirm deposit received (called from webhook)
   */
  async confirmDeposit(
    paymentReference: string,
    amountReceived: number,
    bankTxId?: string
  ): Promise<DepositRecord> {
    const depositIdRaw = await Redis.get(`deposit:ref:${paymentReference}`);
    if (!depositIdRaw) {
      throw new NotFoundException(
        `Deposit with reference ${paymentReference} not found`
      );
    }

    const depositRaw = await Redis.get(RedisKey.deposit(depositIdRaw));
    if (!depositRaw) {
      throw new NotFoundException(`Deposit ${depositIdRaw} not found`);
    }

    const deposit = JSON.parse(depositRaw) as DepositRecord;

    // Verify amount (allow small tolerance for fees)
    const tolerance = deposit.amountExpected * 0.001; // 0.1% tolerance
    if (Math.abs(amountReceived - deposit.amountExpected) > tolerance) {
      this.logger.warn(
        `Deposit amount mismatch: expected ${deposit.amountExpected}, received ${amountReceived}`
      );
    }

    const updated: DepositRecord = {
      ...deposit,
      amountReceived,
      status: "CONFIRMED",
      receivedAt: Date.now(),
      bankTxId,
    };

    await Redis.set(
      RedisKey.deposit(deposit.depositId),
      JSON.stringify(updated),
      "EX",
      DepositService.DEPOSIT_TTL_SEC
    );

    this.logger.log(
      `Deposit confirmed: ${deposit.depositId}, amount: ${amountReceived}`
    );

    return updated;
  }

  /**
   * Get deposit by ID
   */
  async getDeposit(depositId: string): Promise<DepositRecord | null> {
    const raw = await Redis.get(RedisKey.deposit(depositId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as DepositRecord;
    } catch (err) {
      this.logger.error(`Failed to parse deposit ${depositId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Get deposit by payment reference
   */
  async getDepositByReference(
    paymentReference: string
  ): Promise<DepositRecord | null> {
    const depositIdRaw = await Redis.get(`deposit:ref:${paymentReference}`);
    if (!depositIdRaw) return null;

    return this.getDeposit(depositIdRaw);
  }

  private getPaymentMethod(fromToken: string): string {
    const methodMap: Record<string, string> = {
      BRL: "PIX",
      MXN: "SPEI",
      NGN: "bank_transfer",
      USD: "bank_transfer",
      EUR: "bank_transfer",
    };

    return methodMap[fromToken] || "bank_transfer";
  }

  private getAccountDetails(
    method: string,
    quote: ReservedQuote
  ): DepositInstructions["accountDetails"] {
    // In production, this would fetch from config/env or OTC API
    // For MVP, return mock account details
    if (method === "PIX") {
      return {
        pixKey: "mock-pix-key@example.com", // Replace with real PIX key
      };
    }

    if (method === "SPEI") {
      return {
        bankName: "Mock Bank",
        accountNumber: "1234567890",
        routingNumber: "0123456789",
      };
    }

    return {
      bankName: "Mock Bank",
      accountNumber: "1234567890",
      iban: "GB82WEST12345698765432",
    };
  }

  private generatePixQrCode(
    paymentRef: string,
    amount: number
  ): string {
    // In production, generate actual PIX QR code
    // Format: EMV QR code with payment data
    return `00020126580014BR.GOV.BCB.PIX0136mock-pix-key@example.com5204000053039865802BR5913MOCK MERCHANT6009SAO PAULO62070503***6304${this.calculatePixCrc("mock")}`;
  }

  private calculatePixCrc(data: string): string {
    // Simplified CRC calculation for PIX
    // In production, use proper CRC16-CCITT
    return "ABCD";
  }
}

