import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { type Principal } from '../auth/auth.types';
import { CurrentPrincipal, PlatformAdminOnly } from '../auth/decorators';
import { PricingService } from './pricing.service';

const marginSchema = z.object({
  // credits (= USD) added per call minute; the upper limit catches typos
  marginPerMinute: z.number().min(0).max(100).multipleOf(0.0001),
  note: z.string().trim().max(200).optional(),
});

@Controller('admin/pricing')
@PlatformAdminOnly()
export class AdminPricingController {
  private readonly logger = new Logger(AdminPricingController.name);

  constructor(private readonly pricing: PricingService) {}

  @Get()
  async get() {
    const [current, history] = await Promise.all([
      this.pricing.current(),
      this.pricing.history(),
    ]);
    return { ...current, history };
  }

  @Put('margin')
  @HttpCode(200)
  async setMargin(
    @Body() body: unknown,
    @CurrentPrincipal() principal: Principal,
  ) {
    const parsed = marginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'Invalid body: marginPerMinute (number from 0 to 100, up to 4 decimals), note (optional, 200 characters max)',
      );
    }
    const row = await this.pricing.setMarginPerMinute({
      ...parsed.data,
      changedBy: principal.userId,
    });
    this.logger.log(
      `platform admin ${principal.userId} set margin to ${row.marginPerMinute}/min`,
    );
    return row;
  }
}
