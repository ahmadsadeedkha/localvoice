import { computeCallCharge } from './call-pricing';

describe('computeCallCharge', () => {
  it('adds the margin for the exact seconds to the real cost, rounded up to the cent', () => {
    // the real 101-second call: 24.6367 cents + 0.10/min margin = 0.4147 -> 0.42
    expect(
      computeCallCharge({
        providerCostCents: 24.6366734,
        durationSeconds: 101,
        marginPerMinute: 0.1,
      }),
    ).toBe(0.42);
  });

  it('charges only the cost when the margin is zero', () => {
    expect(
      computeCallCharge({
        providerCostCents: 12.4,
        durationSeconds: 1,
        marginPerMinute: 0,
      }),
    ).toBe(0.13);
  });

  it('does not round up an exact cent amount', () => {
    expect(
      computeCallCharge({
        providerCostCents: 20,
        durationSeconds: 60,
        marginPerMinute: 0.1,
      }),
    ).toBe(0.3);
  });

  it('rejects invalid numbers', () => {
    expect(() =>
      computeCallCharge({
        providerCostCents: NaN,
        durationSeconds: 10,
        marginPerMinute: 0.1,
      }),
    ).toThrow();
    expect(() =>
      computeCallCharge({
        providerCostCents: 10,
        durationSeconds: -1,
        marginPerMinute: 0.1,
      }),
    ).toThrow();
  });
});
