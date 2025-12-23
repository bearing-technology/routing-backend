export enum ExecutionStatus {
  PENDING_APPROVAL = "PENDING_APPROVAL",
  EXECUTING = "EXECUTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

export class ExecuteResponse {
  executionId: string;
  status: ExecutionStatus;
  quoteId: string;
  /** If status is PENDING_APPROVAL, this contains the approval token */
  approvalToken?: string;
  /** Estimated completion time (epoch ms) */
  estimatedCompletionAt?: number;
  /** Error message if status is FAILED */
  error?: string;
}
