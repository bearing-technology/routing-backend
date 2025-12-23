import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Redis } from "src/config/redis";
import { ExecutionRecord } from "src/types/routing/execution";
import { ExecutionStatus } from "src/dto/ExecuteResponse";
import { RouteResult } from "src/types/routing/route";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private static readonly EXECUTION_TTL_SEC = 86400; // 24 hours
  private static readonly QUOTE_TTL_SEC = 300; // 5 minutes

  /**
   * Store a quote with a unique ID for later execution
   */
  async storeQuote(
    route: RouteResult | null,
    fallbackRoutes?: RouteResult[]
  ): Promise<{ quoteId: string; expiresAt: number }> {
    const quoteId = `quote:${uuidv4()}`;
    const expiresAt = Date.now() + ExecutionService.QUOTE_TTL_SEC * 1000;

    const data = {
      route,
      fallbackRoutes: fallbackRoutes || [],
      expiresAt,
      createdAt: Date.now(),
    };

    await Redis.set(
      quoteId,
      JSON.stringify(data),
      "EX",
      ExecutionService.QUOTE_TTL_SEC
    );

    return { quoteId, expiresAt };
  }

  /**
   * Retrieve a stored quote
   */
  async getQuote(quoteId: string): Promise<{
    route: RouteResult | null;
    fallbackRoutes: RouteResult[];
    expiresAt: number;
  } | null> {
    const raw = await Redis.get(quoteId);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      return {
        route: parsed.route,
        fallbackRoutes: parsed.fallbackRoutes || [],
        expiresAt: parsed.expiresAt,
      };
    } catch (err) {
      this.logger.error(`Failed to parse quote ${quoteId}: ${err?.message}`);
      return null;
    }
  }

  /**
   * Create a new execution record
   */
  async createExecution(
    quoteId: string,
    route: RouteResult,
    fallbackRoute?: RouteResult
  ): Promise<ExecutionRecord> {
    const executionId = `exec:${uuidv4()}`;
    const approvalToken = route.steps.some((s) => s.venueId.includes("otc"))
      ? `approval:${uuidv4()}`
      : undefined;

    const record: ExecutionRecord = {
      executionId,
      quoteId,
      route,
      status: approvalToken
        ? ExecutionStatus.PENDING_APPROVAL
        : ExecutionStatus.EXECUTING,
      approvalToken,
      transactionHashes: [],
      currentStep: 0,
      createdAt: Date.now(),
      fallbackRoute,
    };

    await this.saveExecution(record);

    // Store quoteId -> executionId mapping
    await Redis.set(
      `execution:quote:${quoteId}`,
      executionId,
      "EX",
      ExecutionService.EXECUTION_TTL_SEC
    );

    return record;
  }

  /**
   * Get execution record by ID
   */
  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    const raw = await Redis.get(`exec:${executionId}`);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as ExecutionRecord;
    } catch (err) {
      this.logger.error(
        `Failed to parse execution ${executionId}: ${err?.message}`
      );
      return null;
    }
  }

  /**
   * Update execution status
   */
  async updateExecution(
    executionId: string,
    updates: Partial<ExecutionRecord>
  ): Promise<ExecutionRecord> {
    const existing = await this.getExecution(executionId);
    if (!existing) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    const updated: ExecutionRecord = {
      ...existing,
      ...updates,
    };

    await this.saveExecution(updated);
    return updated;
  }

  /**
   * Approve an execution (if it requires approval)
   */
  async approveExecution(
    executionId: string,
    approvalToken: string
  ): Promise<ExecutionRecord> {
    const exec = await this.getExecution(executionId);
    if (!exec) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    if (exec.status !== ExecutionStatus.PENDING_APPROVAL) {
      throw new Error(
        `Execution ${executionId} is not pending approval (status: ${exec.status})`
      );
    }

    if (exec.approvalToken !== approvalToken) {
      throw new Error("Invalid approval token");
    }

    return this.updateExecution(executionId, {
      status: ExecutionStatus.EXECUTING,
      approvalToken: undefined,
    });
  }

  /**
   * Mark execution as completed
   */
  async completeExecution(
    executionId: string,
    transactionHashes: string[]
  ): Promise<ExecutionRecord> {
    return this.updateExecution(executionId, {
      status: ExecutionStatus.COMPLETED,
      transactionHashes,
      completedAt: Date.now(),
      currentStep: undefined,
    });
  }

  /**
   * Mark execution as failed
   */
  async failExecution(
    executionId: string,
    error: string,
    useFallback = false
  ): Promise<ExecutionRecord | null> {
    const exec = await this.getExecution(executionId);
    if (!exec) return null;

    if (useFallback && exec.fallbackRoute) {
      // Switch to fallback route
      return this.updateExecution(executionId, {
        route: exec.fallbackRoute,
        status: ExecutionStatus.EXECUTING,
        currentStep: 0,
        transactionHashes: [],
        error: undefined,
      });
    }

    return this.updateExecution(executionId, {
      status: ExecutionStatus.FAILED,
      error,
      completedAt: Date.now(),
    });
  }

  private async saveExecution(record: ExecutionRecord): Promise<void> {
    await Redis.set(
      `exec:${record.executionId}`,
      JSON.stringify(record),
      "EX",
      ExecutionService.EXECUTION_TTL_SEC
    );
  }
}
