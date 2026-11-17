export const PAYMENTS_PROVIDER = Symbol('PAYMENTS_PROVIDER');

export interface CreateCheckoutInput {
  paymentId: string;
  tenantId: string;
  amountCents: number;
  currency: 'usd';
  customerEmail?: string;
  providerCustomerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
}

export type PaymentEvent =
  | {
      type: 'checkout.paid';
      eventId: string;
      sessionId: string;
      paymentId: string;
      tenantId: string;
      amountCents: number;
      providerPaymentId: string | null;
      providerCustomerId: string | null;
    }
  | {
      type: 'checkout.expired';
      eventId: string;
      sessionId: string;
      paymentId: string | null;
    }
  | { type: 'ignored'; eventId: string; rawType: string };

export interface PaymentsProvider {
  readonly name: string;
  createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutSessionResult>;
  /** Verifies the signature and normalizes the event. Throws if invalid. */
  parseWebhook(rawBody: Buffer, signature: string): PaymentEvent;
}
