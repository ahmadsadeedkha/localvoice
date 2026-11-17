import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { WalletService } from '../billing/wallet.service';
import { Payment } from './payment.entity';
import {
  PAYMENTS_PROVIDER,
  type PaymentEvent,
  type PaymentsProvider,
} from './payments-provider.interface';

export const MIN_TOPUP_CENTS = 2000; // $20: a $10 top-up loses ~6% to the fixed fee
export const MAX_TOPUP_CENTS = 100000; // $1,000

type PaidEvent = Extract<PaymentEvent, { type: 'checkout.paid' }>;
type ExpiredEvent = Extract<PaymentEvent, { type: 'checkout.expired' }>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly config: ConfigService,
    private readonly wallets: WalletService,
    @Inject(PAYMENTS_PROVIDER) private readonly provider: PaymentsProvider,
  ) {}

  async createCheckout(
    tenantId: string,
    amountCents: number,
  ): Promise<{ url: string }> {
    if (
      !Number.isInteger(amountCents) ||
      amountCents < MIN_TOPUP_CENTS ||
      amountCents > MAX_TOPUP_CENTS
    ) {
      throw new BadRequestException(
        `Amount must be between ${MIN_TOPUP_CENTS / 100} and ${MAX_TOPUP_CENTS / 100} USD`,
      );
    }

    const rows: { customerId: string | null }[] = await this.ds.query(
      `SELECT stripe_customer_id AS "customerId" FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (rows.length === 0) throw new BadRequestException('Unknown tenant');

    const repo = this.ds.getRepository(Payment);
    const payment = await repo.save(
      repo.create({
        tenantId,
        provider: this.provider.name,
        amountCents,
        currency: 'usd',
        status: 'pending',
      }),
    );

    const frontend = this.config.getOrThrow<string>('FRONTEND_URL');
    try {
      const session = await this.provider.createCheckoutSession({
        paymentId: payment.id,
        tenantId,
        amountCents,
        currency: 'usd',
        providerCustomerId: rows[0].customerId,
        successUrl: `${frontend}/billing?checkout=success`,
        cancelUrl: `${frontend}/billing?checkout=cancelled`,
      });
      await repo.update(payment.id, { providerSessionId: session.sessionId });
      return { url: session.url };
    } catch (err) {
      await repo.update(payment.id, { status: 'expired' });
      this.logger.error(
        `Checkout creation failed for tenant ${tenantId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: PaymentEvent;
    try {
      event = this.provider.parseWebhook(rawBody, signature);
    } catch (err) {
      this.logger.warn(`Rejected webhook: ${(err as Error).message}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'checkout.paid':
        await this.creditPaidCheckout(event);
        break;
      case 'checkout.expired':
        await this.markExpired(event);
        break;
      default:
        this.logger.debug(
          `Ignored ${this.provider.name} event ${event.rawType}`,
        );
    }
  }

  private async creditPaidCheckout(event: PaidEvent): Promise<void> {
    await this.ds.transaction(async (m) => {
      // lock the payment row so two webhook deliveries can't both credit
      const payment = await m.findOne(Payment, {
        where: { id: event.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        this.logger.error(`Paid event for unknown payment ${event.paymentId}`);
        return;
      }
      if (payment.creditedAt) return; // already credited, webhook retry

      // never trust the metadata alone: it must match what we created
      if (
        payment.tenantId !== event.tenantId ||
        payment.provider !== this.provider.name ||
        payment.amountCents !== event.amountCents
      ) {
        this.logger.error(
          `Payment ${payment.id} mismatch (expected ${payment.amountCents}c for tenant ${payment.tenantId}, got ${event.amountCents}c for ${event.tenantId}). Not credited.`,
        );
        return;
      }

      // 1 credit = 1 USD
      await this.wallets.topUp(
        {
          tenantId: payment.tenantId,
          credits: payment.amountCents / 100,
          type: 'purchase',
          paymentRef: event.providerPaymentId ?? event.sessionId,
          note: `Stripe checkout ${event.sessionId}`,
        },
        m,
      );

      await m.update(Payment, payment.id, {
        status: 'paid',
        providerPaymentId: event.providerPaymentId,
        creditedAt: new Date(),
      });

      if (event.providerCustomerId) {
        await m.query(
          `UPDATE tenants SET stripe_customer_id = $2
            WHERE id = $1 AND stripe_customer_id IS NULL`,
          [payment.tenantId, event.providerCustomerId],
        );
      }
    });
  }

  private async markExpired(event: ExpiredEvent): Promise<void> {
    if (!event.paymentId) return;
    await this.ds.query(
      `UPDATE payments SET status = 'expired', updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [event.paymentId],
    );
  }
}
