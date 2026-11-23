/**
 * What a finished call costs the business, in credits (1 credit = $1):
 * the provider's real cost plus a fixed margin per minute, rounded UP to the cent.
 * Integer micro-dollars avoid floating-point drift.
 */
export function computeCallCharge(p: {
  providerCostCents: number;
  durationSeconds: number;
  marginPerMinute: number;
}): number {
  const { providerCostCents, durationSeconds, marginPerMinute } = p;
  for (const n of [providerCostCents, durationSeconds, marginPerMinute]) {
    if (!Number.isFinite(n) || n < 0) {
      throw new Error('computeCallCharge needs finite, non-negative numbers');
    }
  }
  const costMicro = Math.round(providerCostCents * 10_000); // 1 cent = 10,000 micro-dollars
  const marginMicro = Math.round(
    (marginPerMinute * 1_000_000 * durationSeconds) / 60,
  );
  return Math.ceil((costMicro + marginMicro) / 10_000) / 100;
}
