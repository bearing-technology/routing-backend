import { Injectable } from "@nestjs/common";
import { pool } from "./config/postgres.config";
import * as crypto from "crypto";

type CreateOtpParams = {
  recipient: string;
  ttlSeconds?: number;
  codeLength?: number;
};

type VerifyOtpParams = {
  recipient: string;
  code: string;
};

@Injectable()
export class OtpService {
  private static readonly DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes
  private static readonly DEFAULT_CODE_LENGTH = 6;

  private getHmac(input: string): string {
    const secret = process.env.OTP_HMAC_SECRET || "change-me-in-prod";
    return crypto.createHmac("sha256", secret).update(input).digest("hex");
  }

  private generateNumericCode(length: number): string {
    const bytes = crypto.randomBytes(length);
    let code = "";
    for (let i = 0; i < length; i++) {
      code += (bytes[i] % 10).toString();
    }
    return code;
  }

  async ensureTable(): Promise<void> {
    const createSql = `
      CREATE TABLE IF NOT EXISTS auth_otp_codes (
        id SERIAL PRIMARY KEY,
        recipient TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_recipient ON auth_otp_codes(recipient);
      CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_expires_at ON auth_otp_codes(expires_at);
    `;
    await pool.query(createSql);
  }

  async createAndStoreOtp({
    recipient,
    ttlSeconds,
    codeLength,
  }: CreateOtpParams): Promise<{ code: string; expiresAt: Date }> {
    await this.ensureTable();

    const length = codeLength || OtpService.DEFAULT_CODE_LENGTH;
    const code = this.generateNumericCode(length);
    const codeHash = this.getHmac(code);
    const ttl = ttlSeconds ?? OtpService.DEFAULT_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await pool.query(
      `UPDATE auth_otp_codes SET consumed_at = NOW() WHERE recipient = $1 AND consumed_at IS NULL`,
      [recipient]
    );

    await pool.query(
      `INSERT INTO auth_otp_codes (recipient, code_hash, expires_at) VALUES ($1, $2, $3)`,
      [recipient, codeHash, expiresAt]
    );

    return { code, expiresAt };
  }

  async verifyAndConsume({
    recipient,
    code,
  }: VerifyOtpParams): Promise<{ valid: boolean; reason?: string }> {
    const { rows } = await pool.query(
      `SELECT id, code_hash, expires_at, consumed_at
       FROM auth_otp_codes
       WHERE recipient = $1 AND consumed_at IS NULL
       ORDER BY id DESC
       LIMIT 1`,
      [recipient]
    );

    if (rows.length === 0) {
      return { valid: false, reason: "not_found" };
    }

    const latest = rows[0] as {
      id: number;
      code_hash: string;
      expires_at: Date;
      consumed_at: Date | null;
    };

    if (new Date(latest.expires_at).getTime() < Date.now()) {
      return { valid: false, reason: "expired" };
    }

    const providedHash = this.getHmac(code);
    if (providedHash !== latest.code_hash) {
      return { valid: false, reason: "not_latest" };
    }

    await pool.query(
      `UPDATE auth_otp_codes SET consumed_at = NOW() WHERE id = $1`,
      [latest.id]
    );

    void pool.query(
      `DELETE FROM auth_otp_codes WHERE expires_at < NOW() - INTERVAL '1 day'`
    );

    return { valid: true };
  }

  async invalidate(recipient: string): Promise<{ invalidatedCount: number }> {
    await this.ensureTable();
    const result = await pool.query(
      `UPDATE auth_otp_codes
       SET consumed_at = NOW()
       WHERE recipient = $1 AND consumed_at IS NULL`,
      [recipient]
    );
    return { invalidatedCount: result.rowCount ?? 0 };
  }
}
