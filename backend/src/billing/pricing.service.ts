import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { PricingMarginChange } from './pricing-margin-change.entity';

@Injectable()
export class PricingService {
  constructor(
    private readonly ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  private async latest(): Promise<PricingMarginChange | null> {
    const [row] = await this.ds
      .getRepository(PricingMarginChange)
      .find({ order: { createdAt: 'DESC' }, take: 1 });
    return row ?? null;
  }

  /** Margin added per call minute, in credits (1 credit = $1). */
  async getMarginPerMinute(): Promise<number> {
    const row = await this.latest();
    return (
      row?.marginPerMinute ??
      this.config.getOrThrow<number>('DEFAULT_MARGIN_PER_MINUTE')
    );
  }

  async setMarginPerMinute(p: {
    marginPerMinute: number;
    changedBy: string;
    note?: string;
  }): Promise<PricingMarginChange> {
    const repo = this.ds.getRepository(PricingMarginChange);
    return repo.save(
      repo.create({
        marginPerMinute: p.marginPerMinute,
        changedBy: p.changedBy,
        note: p.note ?? null,
      }),
    );
  }

  async history(limit = 20): Promise<PricingMarginChange[]> {
    return this.ds
      .getRepository(PricingMarginChange)
      .find({ order: { createdAt: 'DESC' }, take: limit });
  }

  async current() {
    const row = await this.latest();
    return {
      marginPerMinute:
        row?.marginPerMinute ??
        this.config.getOrThrow<number>('DEFAULT_MARGIN_PER_MINUTE'),
      isDefault: row === null,
    };
  }
}
