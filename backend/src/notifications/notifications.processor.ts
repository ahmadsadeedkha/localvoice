import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Invoice } from '../billing/invoice.entity';
import { EmailService } from './email.service';
import {
  buildNotification,
  renderEmail,
  type NotificationContent,
} from './notification-templates';
import { NotificationsService } from './notifications.service';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly log = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
  ) {
    super();
  }

  async process(job: Job) {
    const data = job.data ?? {};

    // Platform-level job (for your admins), not a tenant notification.
    if (job.name === 'invoice-needs-pricing') {
      this.log.log(
        `Invoices need pricing for ${data.tenantIds?.length ?? 0} business(es), period ${data.period}`,
      );
      return;
    }

    const tenantId = data.tenantId;
    if (typeof tenantId !== 'string') return;

    let extra: Record<string, unknown> = {};
    if (job.name === 'invoice-issued' || job.name === 'invoice-reminder') {
      const inv = await this.invoices.findOne({
        where: { id: data.invoiceId, tenantId },
      });
      if (!inv) return;
      extra = {
        amount: inv.amount,
        dueAt: inv.dueAt,
        periodStart: inv.periodStart,
      };
    }

    const content = buildNotification(job.name, { ...data, ...extra });
    if (!content) {
      this.log.warn(`Unknown notification job "${job.name}"`);
      return;
    }

    const created = await this.notifications.create(tenantId, {
      type: job.name,
      ...content,
      dedupeKey: job.id ? `${job.name}:${job.id}` : null,
    });
    if (!created) return; // a retry of a job that already ran

    await this.sendEmails(tenantId, content);
  }

  /** Best effort: a failed email is logged, never retried (no duplicate bell entries). */
  private async sendEmails(tenantId: string, content: NotificationContent) {
    const recipients = await this.notifications.emailRecipients(tenantId);
    const { subject, html } = renderEmail(
      content,
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    for (const r of recipients) {
      try {
        await this.email.send({
          to: { email: r.email, ...(r.name ? { name: r.name } : {}) },
          subject,
          html,
        });
      } catch (e) {
        this.log.error(
          `Email to ${r.email} failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
}
