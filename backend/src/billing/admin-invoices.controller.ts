import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, PlatformAdminOnly } from '../auth/decorators';
import { BillingSettingsService } from './billing-settings.service';
import {
  InvoicesService,
  monthStartUtc,
  toInvoiceDto,
} from './invoices.service';
import { type TenantWallet } from './tenant-wallet.entity';

const settingsSchema = z.strictObject({
  billingMode: z.enum(['prepaid', 'postpaid']).optional(),
  creditLimit: z.number().min(0).max(1_000_000).optional(),
  lowBalanceThreshold: z.number().min(-1_000_000).max(1_000_000).optional(),
  pricePerCredit: z.number().positive().nullable().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .length(3)
    .transform((s) => s.toUpperCase())
    .nullable()
    .optional(),
  invoiceDueDays: z.number().int().min(1).max(60).optional(),
});

const generateSchema = z.object({
  year: z.number().int().min(2024).max(2100),
  month: z.number().int().min(1).max(12),
});

const paidSchema = z.object({
  reference: z.string().trim().max(150).optional(),
});

const priceSchema = z.object({
  pricePerCredit: z.number().positive(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .length(3)
    .transform((s) => s.toUpperCase()),
});

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

// A tenant without a wallet row behaves as a fresh prepaid tenant.
const emptyWalletDto = (tenantId: string) => ({
  tenantId,
  billingMode: 'prepaid' as const,
  balanceCredits: 0,
  creditLimit: 0,
  lowBalanceThreshold: 10,
  pricePerCredit: null,
  currency: null,
  invoiceDueDays: 7,
  blockedReason: null,
});

const toWalletDto = (w: TenantWallet) => ({
  tenantId: w.tenantId,
  billingMode: w.billingMode,
  balanceCredits: w.balanceCredits,
  creditLimit: w.creditLimit,
  lowBalanceThreshold: w.lowBalanceThreshold,
  pricePerCredit: w.pricePerCredit,
  currency: w.currency,
  invoiceDueDays: w.invoiceDueDays,
  blockedReason: w.blockedReason,
});

@Controller('admin')
@PlatformAdminOnly()
export class AdminInvoicesController {
  private readonly logger = new Logger(AdminInvoicesController.name);

  constructor(
    private readonly invoices: InvoicesService,
    private readonly settings: BillingSettingsService,
  ) {}

  @Get('billing/needs-pricing')
  async needsPricing() {
    return { items: await this.invoices.needsPricing() };
  }

  @Get('tenants/:id/billing')
  async getBilling(@Param('id', ParseUUIDPipe) id: string) {
    const { tenantName, wallet } = await this.settings.get(id);
    return {
      tenantName,
      ...(wallet ? toWalletDto(wallet) : emptyWalletDto(id)),
    };
  }

  @Patch('tenants/:id/billing')
  async updateBilling(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const patch = parseBody(settingsSchema, body);
    const wallet = await this.settings.update(id, patch);
    this.logger.log(
      `platform admin ${principal.userId} updated billing of tenant ${id}: ${JSON.stringify(patch)}`,
    );
    return toWalletDto(wallet);
  }

  @Get('tenants/:id/invoices')
  async list(@Param('id', ParseUUIDPipe) id: string) {
    const items = await this.invoices.listForTenant(id);
    return { items: items.map(toInvoiceDto) };
  }

  // manual generation: handy for testing and for billing a month by hand
  @Post('tenants/:id/invoices')
  @HttpCode(200)
  async generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const { year, month } = parseBody(generateSchema, body);
    const result = await this.invoices.generateForTenant(
      id,
      monthStartUtc(year, month),
    );
    if (!result) {
      return {
        created: false,
        invoice: null,
        reason:
          'Tenant is not postpaid, had no usage, or the total rounds to zero',
      };
    }
    if (result.invoice.issueNoticePending)
      await this.invoices.notifyIssued(result.invoice);
    return { created: result.created, invoice: toInvoiceDto(result.invoice) };
  }

  @Post('invoices/:invoiceId/paid')
  @HttpCode(200)
  async markPaid(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const { reference } = parseBody(paidSchema, body);
    const invoice = await this.invoices.markPaid(
      invoiceId,
      principal.userId,
      reference,
    );
    this.logger.log(
      `platform admin ${principal.userId} marked invoice ${invoiceId} paid`,
    );
    return toInvoiceDto(invoice);
  }

  @Post('invoices/:invoiceId/void')
  @HttpCode(200)
  async voidInvoice(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    const invoice = await this.invoices.voidInvoice(invoiceId);
    this.logger.log(
      `platform admin ${principal.userId} voided invoice ${invoiceId}`,
    );
    return toInvoiceDto(invoice);
  }

  @Patch('invoices/:invoiceId/price')
  async setPrice(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const { pricePerCredit, currency } = parseBody(priceSchema, body);
    const invoice = await this.invoices.setPrice(
      invoiceId,
      pricePerCredit,
      currency,
    );
    this.logger.log(
      `platform admin ${principal.userId} priced invoice ${invoiceId} at ${pricePerCredit} ${currency}`,
    );
    return toInvoiceDto(invoice);
  }

  // run the daily reminder/blocking pass now (testing)
  @Post('billing/daily-checks')
  @HttpCode(200)
  runDailyChecks() {
    return this.invoices.runDailyChecks();
  }
}
