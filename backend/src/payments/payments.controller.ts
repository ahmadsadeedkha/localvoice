import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, Roles } from '../auth/decorators';
import { MemberRole } from '../tenants/tenant-member.entity';
import {
  MAX_TOPUP_CENTS,
  MIN_TOPUP_CENTS,
  PaymentsService,
} from './payments.service';

const checkoutSchema = z.object({
  amountCents: z.number().int().min(MIN_TOPUP_CENTS).max(MAX_TOPUP_CENTS),
});

@Controller('billing')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // tenant comes from the verified token, never from the body
  @Post('checkout-sessions')
  @HttpCode(200)
  @Roles(MemberRole.Owner, MemberRole.Admin)
  async createCheckout(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!principal.tenantId) throw new ForbiddenException();

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        `amountCents must be a whole number between ${MIN_TOPUP_CENTS} and ${MAX_TOPUP_CENTS}`,
      );
    }
    return this.payments.createCheckout(
      principal.tenantId,
      parsed.data.amountCents,
    );
  }
}
