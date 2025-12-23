import { RouteResult } from "src/types/routing/route";
import { ExecutionStatus } from "./ExecuteResponse";

export class StatusResponse {
  executionId: string;
  status: ExecutionStatus;
  route: RouteResult | null;
  /** Transaction hashes for each step */
  transactionHashes?: string[];
  /** Current step being executed (0-indexed) */
  currentStep?: number;
  /** Completion timestamp (epoch ms) */
  completedAt?: number;
  /** Error message if status is FAILED */
  error?: string;
}

