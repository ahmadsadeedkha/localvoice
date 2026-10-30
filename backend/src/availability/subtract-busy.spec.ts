import { subtractBusy } from './subtract-busy';

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`);
const slot = (from: string, to: string, resourceId = 'r1') => ({
  start: at(from),
  end: at(to),
  resourceId,
});

describe('subtractBusy', () => {
  const slots = [
    slot('09:00', '10:00'),
    slot('10:00', '11:00'),
    slot('11:00', '12:00'),
  ];

  it('returns all slots when nothing is busy', () => {
    expect(subtractBusy(slots, [])).toHaveLength(3);
  });

  it('removes a slot that overlaps a busy block', () => {
    const left = subtractBusy(slots, [
      { start: at('10:30'), end: at('10:45') },
    ]);
    expect(left.map((s) => s.start)).toEqual([at('09:00'), at('11:00')]);
  });

  it('keeps slots that only touch the busy block edges', () => {
    const left = subtractBusy(slots, [
      { start: at('10:00'), end: at('11:00') },
    ]);
    expect(left.map((s) => s.start)).toEqual([at('09:00'), at('11:00')]);
  });

  it('removes every slot under a long busy block', () => {
    expect(
      subtractBusy(slots, [{ start: at('08:00'), end: at('13:00') }]),
    ).toEqual([]);
  });

  it('blocks all resources at that time', () => {
    const two = [slot('09:00', '10:00', 'r1'), slot('09:00', '10:00', 'r2')];
    expect(
      subtractBusy(two, [{ start: at('09:15'), end: at('09:30') }]),
    ).toEqual([]);
  });
});
