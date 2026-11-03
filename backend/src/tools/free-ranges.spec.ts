import { DateTime } from 'luxon';
import { freeRanges } from './free-ranges';

const t = (hhmm: string) =>
  DateTime.fromISO(`2026-11-05T${hhmm}`, { zone: 'Asia/Karachi' });

describe('freeRanges', () => {
  it('returns nothing for no slots', () => {
    expect(freeRanges([], 15)).toEqual([]);
  });

  it('merges back-to-back start times into windows', () => {
    const starts = ['09:00', '09:15', '09:30', '14:00', '14:15'].map(t);
    expect(freeRanges(starts, 15)).toEqual([
      '9:00 AM to 9:30 AM',
      '2:00 PM to 2:15 PM',
    ]);
  });

  it('shows a lone start time on its own', () => {
    expect(freeRanges(['16:30', '09:00', '09:15'].map(t), 15)).toEqual([
      '9:00 AM to 9:15 AM',
      '4:30 PM',
    ]);
  });

  it('splits when there is a gap bigger than one step', () => {
    expect(freeRanges(['10:00', '10:30'].map(t), 15)).toEqual([
      '10:00 AM',
      '10:30 AM',
    ]);
  });
});
