export interface CallContext {
  tenantId: string;
  /** our calls.id (uuid) */
  callId: string;
  retellCallId: string;
}
