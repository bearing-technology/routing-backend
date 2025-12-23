import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { QuoteRequest } from "src/dto/QuoteRequest";
import { QuoteResponse } from "src/dto/QuoteResponse";
import { ExecuteRequest } from "src/dto/ExecuteRequest";
import { ExecuteResponse, ExecutionStatus } from "src/dto/ExecuteResponse";
import { StatusRequest } from "src/dto/StatusRequest";
import { StatusResponse } from "src/dto/StatusResponse";
import { QuoteResponseV2 } from "src/dto/QuoteResponseV2";
import { ExecuteResponseV2 } from "src/dto/ExecuteResponseV2";
import { DepositWebhookRequest } from "src/dto/DepositWebhookRequest";
import { OtcRoutingService } from "./otc-routing.service";
import { ExecutionService } from "./execution.service";
import { QuoteLifecycleService } from "./quote-lifecycle.service";
import { DepositService } from "./deposit.service";
import { SettlementScoringService } from "./settlement-scoring.service";
import { QuoteStatus } from "src/types/routing/quote-lifecycle";

@Controller("routing")
export class RoutingController {
  private readonly logger = new Logger(RoutingController.name);

  constructor(
    private readonly routingService: OtcRoutingService,
    private readonly executionService: ExecutionService,
    private readonly quoteLifecycle: QuoteLifecycleService,
    private readonly depositService: DepositService,
    private readonly settlementScoring: SettlementScoringService
  ) {}

  /**
   * Debug/inspection endpoint: return cached quotes for a token pair from Redis.
   * Example: GET /routing/quotes?fromToken=BRL&toToken=USD
   */
  @Get("quotes")
  async getCachedQuotesEndpoint(
    @Query("fromToken") fromToken: string,
    @Query("toToken") toToken: string
  ): Promise<{ fromToken: string; toToken: string; quotes: any[] }> {
    if (!fromToken || !toToken) {
      throw new BadRequestException("fromToken and toToken are required");
    }

    const quotes = await this.routingService.getCachedQuotes(
      fromToken,
      toToken
    );
    return { fromToken, toToken, quotes };
  }

  @Post("quote")
  async getQuote(@Body() request: QuoteRequest): Promise<QuoteResponse> {
    if (!request.amountIn || request.amountIn <= 0) {
      throw new BadRequestException("amountIn must be positive");
    }
    if (!request.fromToken || !request.toToken) {
      throw new BadRequestException("fromToken and toToken are required");
    }

    // Get best route
    const { route, consideredQuotes } = await this.routingService.getBestRoute({
      amountIn: request.amountIn,
      fromToken: request.fromToken,
      toToken: request.toToken,
      intermediates: request.intermediates,
      minExpiryMs: request.minExpiryMs || 5000, // Default 5s minimum validity
    });

    // Get fallback routes (alternative paths)
    const fallbackRoutes = await this.getFallbackRoutes(request);

    // Store quote for execution
    const { quoteId, expiresAt } = await this.executionService.storeQuote(
      route,
      fallbackRoutes
    );

    return {
      route,
      quoteId,
      expiresAt,
      consideredQuotes,
      fallbackRoutes: fallbackRoutes.length > 0 ? fallbackRoutes : undefined,
    };
  }

  @Post("execute")
  async executeRoute(
    @Body() request: ExecuteRequest
  ): Promise<ExecuteResponse> {
    if (!request.quoteId) {
      throw new BadRequestException("quoteId is required");
    }

    // Retrieve quote
    const quote = await this.executionService.getQuote(request.quoteId);
    if (!quote) {
      throw new NotFoundException(
        `Quote ${request.quoteId} not found or expired`
      );
    }

    if (Date.now() >= quote.expiresAt) {
      throw new BadRequestException("Quote has expired");
    }

    if (!quote.route) {
      throw new BadRequestException("No route available for this quote");
    }

    // Create execution record
    const execution = await this.executionService.createExecution(
      request.quoteId,
      quote.route,
      quote.fallbackRoutes?.[0]
    );

    // If approval is required, return pending status
    if (execution.status === ExecutionStatus.PENDING_APPROVAL) {
      return {
        executionId: execution.executionId,
        status: ExecutionStatus.PENDING_APPROVAL,
        quoteId: request.quoteId,
        approvalToken: execution.approvalToken,
      };
    }

    // Start execution (async, non-blocking)
    this.executeRouteAsync(execution.executionId).catch((err) => {
      this.logger.error(
        `Failed to execute route ${execution.executionId}: ${err.message}`
      );
    });

    return {
      executionId: execution.executionId,
      status: ExecutionStatus.EXECUTING,
      quoteId: request.quoteId,
      estimatedCompletionAt: Date.now() + 60000, // 1 minute estimate
    };
  }

  @Get("status")
  async getStatus(
    @Query("executionId") executionId: string
  ): Promise<StatusResponse> {
    if (!executionId) {
      throw new BadRequestException("executionId is required");
    }

    const execution = await this.executionService.getExecution(executionId);
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }

    return {
      executionId: execution.executionId,
      status: execution.status,
      route: execution.route,
      transactionHashes: execution.transactionHashes,
      currentStep: execution.currentStep,
      completedAt: execution.completedAt,
      error: execution.error,
    };
  }

  /**
   * Get fallback routes (alternative paths if primary route fails)
   */
  private async getFallbackRoutes(request: QuoteRequest): Promise<any[]> {
    const fallbacks: any[] = [];

    // Try different intermediaries
    const commonIntermediaries = ["USDC", "USDT", "EURC", "EUR"];
    for (const intermediate of commonIntermediaries) {
      if (
        intermediate === request.fromToken ||
        intermediate === request.toToken
      ) {
        continue;
      }

      const { route } = await this.routingService.getBestRoute({
        amountIn: request.amountIn,
        fromToken: request.fromToken,
        toToken: request.toToken,
        intermediates: [intermediate],
        minExpiryMs: request.minExpiryMs || 5000,
      });

      if (route) {
        fallbacks.push(route);
        if (fallbacks.length >= 2) break; // Limit to 2 fallbacks
      }
    }

    return fallbacks;
  }

  /**
   * Execute route asynchronously (simulated for MVP)
   */
  private async executeRouteAsync(executionId: string): Promise<void> {
    const execution = await this.executionService.getExecution(executionId);
    if (!execution) return;

    try {
      // Simulate step-by-step execution
      for (let i = 0; i < execution.route.steps.length; i++) {
        await this.executionService.updateExecution(executionId, {
          currentStep: i,
        });

        // Simulate execution delay
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Simulate transaction hash (in real implementation, this would be actual on-chain tx)
        const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;
        const currentHashes = execution.transactionHashes || [];
        currentHashes.push(txHash);

        await this.executionService.updateExecution(executionId, {
          transactionHashes: currentHashes,
        });
      }

      // Mark as completed
      await this.executionService.completeExecution(
        executionId,
        execution.transactionHashes || []
      );
    } catch (error) {
      // Try fallback route if available
      const exec = await this.executionService.getExecution(executionId);
      if (exec?.fallbackRoute) {
        this.logger.warn(
          `Primary route failed for ${executionId}, attempting fallback`
        );
        await this.executionService.failExecution(
          executionId,
          error.message,
          true // use fallback
        );
        // Retry with fallback
        await this.executeRouteAsync(executionId);
      } else {
        await this.executionService.failExecution(executionId, error.message);
      }
    }
  }

  /**
   * V2 API: Get multiple ranked quotes with settlement scoring
   */
  @Post("quote/v2")
  async getQuotesV2(
    @Body()
    request: QuoteRequest & {
      clientId?: string;
      priority?: "cost" | "speed" | "balanced";
    }
  ): Promise<QuoteResponseV2> {
    if (!request.amountIn || request.amountIn <= 0) {
      throw new BadRequestException("amountIn must be positive");
    }
    if (!request.fromToken || !request.toToken) {
      throw new BadRequestException("fromToken and toToken are required");
    }

    const quotes: QuoteResponseV2["quotes"] = [];

    try {
      // Get primary route
      const routeResult = await this.routingService.getBestRoute({
        amountIn: request.amountIn,
        fromToken: request.fromToken,
        toToken: request.toToken,
        intermediates: request.intermediates,
        minExpiryMs: request.minExpiryMs || 5000,
      });

      if (!routeResult) {
        this.logger.warn("getBestRoute returned undefined");
        return { quotes: [] };
      }

      const { route, consideredQuotes } = routeResult;

      if (route) {
        try {
          // Get quotes used in route for scoring
          const routeQuotes = await this.getQuotesForRoute(route);
          const scoringMeta = this.settlementScoring.getScoringMetadata(
            route,
            routeQuotes
          );
          const netAmountOut = this.settlementScoring.calculateNetOutput(
            route.totalOut,
            route,
            routeQuotes
          );

          const provisional = await this.quoteLifecycle.storeProvisionalQuote(
            route,
            request.amountIn,
            route.totalOut,
            netAmountOut,
            route.totalFeesBps,
            scoringMeta,
            this.getRouteType(route)
          );

          quotes.push({
            quoteId: provisional.quoteId,
            route,
            amountOut: route.totalOut,
            netAmountOut,
            expiryTs: provisional.expiryTs,
            type: provisional.type,
            confidence: scoringMeta.confidence,
            scoringMeta: {
              settlementDays: scoringMeta.settlementDays,
              counterpartyRisk: scoringMeta.counterpartyRisk,
              timePenalty: scoringMeta.timePenalty,
            },
          });
        } catch (error) {
          this.logger.error(
            `Failed to process route for quote: ${error.message}`,
            error.stack
          );
          // Continue with other routes even if one fails
        }
      }

      // Get fallback routes
      try {
        const fallbackRoutes = await this.getFallbackRoutes(request);
        for (const fallbackRoute of fallbackRoutes.slice(0, 2)) {
          try {
            const routeQuotes = await this.getQuotesForRoute(fallbackRoute);
            const scoringMeta = this.settlementScoring.getScoringMetadata(
              fallbackRoute,
              routeQuotes
            );
            const netAmountOut = this.settlementScoring.calculateNetOutput(
              fallbackRoute.totalOut,
              fallbackRoute,
              routeQuotes
            );

            const provisional = await this.quoteLifecycle.storeProvisionalQuote(
              fallbackRoute,
              request.amountIn,
              fallbackRoute.totalOut,
              netAmountOut,
              fallbackRoute.totalFeesBps,
              scoringMeta,
              this.getRouteType(fallbackRoute)
            );

            quotes.push({
              quoteId: provisional.quoteId,
              route: fallbackRoute,
              amountOut: fallbackRoute.totalOut,
              netAmountOut,
              expiryTs: provisional.expiryTs,
              type: provisional.type,
              confidence: scoringMeta.confidence,
              scoringMeta: {
                settlementDays: scoringMeta.settlementDays,
                counterpartyRisk: scoringMeta.counterpartyRisk,
                timePenalty: scoringMeta.timePenalty,
              },
            });
          } catch (error) {
            this.logger.error(
              `Failed to process fallback route: ${error.message}`,
              error.stack
            );
            // Continue with other fallback routes
          }
        }
      } catch (error) {
        this.logger.error(
          `Failed to get fallback routes: ${error.message}`,
          error.stack
        );
        // Continue even if fallback routes fail
      }

      // Sort by netAmountOut (best first)
      quotes.sort((a, b) => b.netAmountOut - a.netAmountOut);

      // If no quotes found, return empty array (not an error)
      if (quotes.length === 0) {
        this.logger.warn(
          `No routes found for ${request.fromToken} → ${request.toToken} with amount ${request.amountIn}`
        );
      }

      return { quotes };
    } catch (error) {
      this.logger.error(`Failed to get quotes: ${error.message}`, error.stack);
      // Return empty quotes array instead of throwing error
      return { quotes: [] };
    }
  }

  /**
   * V2 API: Accept/Reserve a quote and get deposit instructions
   */
  @Post("execute/v2")
  async executeV2(
    @Body() request: ExecuteRequest & { clientId: string }
  ): Promise<ExecuteResponseV2> {
    if (!request.quoteId) {
      throw new BadRequestException("quoteId is required");
    }
    if (!request.clientId) {
      throw new BadRequestException("clientId is required");
    }

    // Get provisional quote
    const provisional = await this.quoteLifecycle.getProvisionalQuote(
      request.quoteId
    );
    if (!provisional) {
      throw new NotFoundException(
        `Quote ${request.quoteId} not found or expired`
      );
    }

    if (!provisional.route) {
      throw new BadRequestException("No route available for this quote");
    }

    // Attempt OTC reservation (if supported)
    let otcReservationMeta;
    if (provisional.type === "OTC" || provisional.type === "OTC+DEX") {
      // In production, call OTC API to reserve
      // For MVP, simulate reservation
      otcReservationMeta = {
        otcReservationId: `otc-reservation-${Date.now()}`,
        depositAddress: provisional.route.steps[0]?.venueId.includes("otc")
          ? "mock-deposit-address"
          : undefined,
      };
    }

    // Reserve quote
    const reserved = await this.quoteLifecycle.reserveQuote(
      request.quoteId,
      request.clientId,
      otcReservationMeta
    );

    // Create deposit instructions
    const depositInstructions =
      await this.depositService.createDepositInstructions(
        request.quoteId,
        request.clientId,
        reserved
      );

    // Create execution record
    const execution = await this.executionService.createExecution(
      request.quoteId,
      reserved.route!,
      undefined // fallback handled separately
    );

    // Update execution status to PENDING_DEPOSIT
    await this.executionService.updateExecution(execution.executionId, {
      status: ExecutionStatus.PENDING_APPROVAL, // Using as PENDING_DEPOSIT
    });

    return {
      reservationId: reserved.reservationId,
      quoteId: request.quoteId,
      status: ExecutionStatus.PENDING_APPROVAL,
      depositInstructions,
      reservedUntil: reserved.reservedUntilTs,
      otcReservationId: otcReservationMeta?.otcReservationId,
    };
  }

  /**
   * Webhook: Deposit received confirmation
   */
  @Post("webhooks/deposit")
  async depositWebhook(@Body() request: DepositWebhookRequest): Promise<{
    success: boolean;
    depositId?: string;
    executionId?: string;
  }> {
    try {
      const deposit = await this.depositService.confirmDeposit(
        request.paymentReference,
        request.amountReceived,
        request.bankTxId
      );

      // Get reserved quote
      const reserved = await this.quoteLifecycle.getReservedQuote(
        deposit.quoteId
      );
      if (!reserved) {
        this.logger.error(
          `Reserved quote ${deposit.quoteId} not found for deposit ${deposit.depositId}`
        );
        return { success: false };
      }

      // Get execution
      const executions = await this.findExecutionByQuoteId(deposit.quoteId);
      if (executions.length === 0) {
        this.logger.error(`No execution found for quote ${deposit.quoteId}`);
        return { success: false };
      }

      const execution = executions[0];

      // Update execution to DEPOSIT_CONFIRMED and start execution
      await this.executionService.updateExecution(execution.executionId, {
        status: ExecutionStatus.EXECUTING,
      });

      // Start async execution
      this.executeRouteAsync(execution.executionId).catch((err) => {
        this.logger.error(
          `Failed to execute route after deposit confirmation: ${err.message}`
        );
      });

      return {
        success: true,
        depositId: deposit.depositId,
        executionId: execution.executionId,
      };
    } catch (error) {
      this.logger.error(`Deposit webhook failed: ${error.message}`);
      return { success: false };
    }
  }

  private async getQuotesForRoute(route: any): Promise<any[]> {
    // Fetch actual quotes from Redis using venueId and tokens
    const quotes: any[] = [];
    const { Redis } = require("src/config/redis");

    if (!route || !route.steps || route.steps.length === 0) {
      return quotes; // Return empty array if no steps
    }

    for (const step of route.steps) {
      if (!step.fromToken || !step.toToken || !step.venueId) {
        continue; // Skip invalid steps
      }

      let quoteKey: string;

      // Use different key pattern for DEX vs OTC
      if (step.venueId.startsWith("dex:")) {
        quoteKey = `routing:edge:solana:${step.fromToken}:${step.toToken}:${step.venueId}`;
      } else {
        quoteKey = `quote:otc:${step.fromToken}:${step.toToken}:${step.venueId}`;
      }

      try {
        const raw = await Redis.get(quoteKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            quotes.push(parsed);
          } catch (err) {
            this.logger.warn(
              `Failed to parse quote from ${quoteKey}: ${err?.message}`
            );
            // Continue with other quotes
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to get quote from Redis ${quoteKey}: ${err?.message}`
        );
        // Continue with other quotes
      }
    }

    return quotes;
  }

  private getRouteType(route: any): "OTC" | "DEX" | "OTC+DEX" {
    if (!route?.steps) return "DEX";

    const hasOtc = route.steps.some((s: any) => s.venueId?.includes("otc"));
    const hasDex = route.steps.some(
      (s: any) => s.venueId?.includes("jup") || s.venueId?.includes("dex")
    );

    if (hasOtc && hasDex) return "OTC+DEX";
    if (hasOtc) return "OTC";
    return "DEX";
  }

  private async findExecutionByQuoteId(quoteId: string): Promise<any[]> {
    // In production, maintain quoteId -> executionId mapping in Redis
    // For MVP, try to find execution by checking if quoteId matches
    const executionIdKey = `execution:quote:${quoteId}`;
    const executionId = await require("src/config/redis").Redis.get(
      executionIdKey
    );

    if (executionId) {
      const exec = await this.executionService.getExecution(executionId);
      return exec ? [exec] : [];
    }

    return [];
  }
}
