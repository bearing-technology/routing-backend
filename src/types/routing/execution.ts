import { RouteResult } from "./route";
import { ExecutionStatus } from "src/dto/ExecuteResponse";

export interface ExecutionRecord {
  executionId: string;
  quoteId: string;
  route: RouteResult;
  status: ExecutionStatus;
  approvalToken?: string;
  transactionHashes?: string[];
  currentStep?: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
  /** Fallback route if primary route fails */
  fallbackRoute?: RouteResult;
}
