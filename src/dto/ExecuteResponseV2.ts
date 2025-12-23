import { ExecutionStatus } from "./ExecuteResponse";
import { DepositInstructions } from "src/types/routing/quote-lifecycle";

export class ExecuteResponseV2 {
  reservationId: string;
  quoteId: string;
  status: ExecutionStatus;
  depositInstructions?: DepositInstructions;
  reservedUntil: number;
  /** If OTC supports API reservation, this is the OTC reservation ID */
  otcReservationId?: string;
}
