import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CheckoutSessionResult,
  CreateCheckoutInput,
  PaymentEvent,
  PaymentsProvider,
} from './payments-provider.interface';

@Injectable()
export class StripeProvider implements PaymentsProvider {
  readonly name = 'stripe';
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    this.stripe = new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY'));
    this.webhookSecret = config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }

  async createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<CheckoutSessionResult> {
    const metadata = {
      payment_id: input.paymentId,
      tenant_id: input.tenantId,
    };

    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Reuse the tenant's Stripe customer if we have one, otherwise
        // let Stripe create it and we save the id from the webhook.
        ...(input.providerCustomerId
          ? { customer: input.providerCustomerId }
          : {
              customer_creation: 'always' as const,
              customer_email: input.customerEmail,
            }),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency,
              unit_amount: input.amountCents,
              product_data: { name: 'LocalVoice credits' },
            },
          },
        ],
        client_reference_id: input.paymentId,
        metadata,
        payment_intent_data: { metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      // Same payment row can never create two different sessions.
      { idempotencyKey: `checkout-${input.paymentId}` },
    );

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }
    return { sessionId: session.id, url: session.url };
  }

  parseWebhook(rawBody: Buffer, signature: string): PaymentEvent {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status !== 'paid') {
          return { type: 'ignored', eventId: event.id, rawType: event.type };
        }
        const paymentId = session.metadata?.payment_id;
        const tenantId = session.metadata?.tenant_id;
        if (!paymentId || !tenantId) {
          return { type: 'ignored', eventId: event.id, rawType: event.type };
        }
        return {
          type: 'checkout.paid',
          eventId: event.id,
          sessionId: session.id,
          paymentId,
          tenantId,
          amountCents: session.amount_total ?? 0,
          providerPaymentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
          providerCustomerId:
            typeof session.customer === 'string'
              ? session.customer
              : (session.customer?.id ?? null),
        };
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        return {
          type: 'checkout.expired',
          eventId: event.id,
          sessionId: session.id,
          paymentId: session.metadata?.payment_id ?? null,
        };
      }
      default:
        return { type: 'ignored', eventId: event.id, rawType: event.type };
    }
  }
}
