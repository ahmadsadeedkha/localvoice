import { DateTime } from 'luxon';
import { nearestSlots } from './nearest-slots';

const tz = 'Asia/Karachi';
const t = (hhmm: string) =>
  DateTime.fromISO(`2026-11-02T${hhmm}`, { zone: tz });
const fmt = (dts: DateTime[]) => dts.map((d) => d.toFormat('HH:mm'));

describe('nearestSlots', () => {
  const day = [
    '09:00',
    '09:30',
    '10:00',
    '14:00',
    '14:30',
    '15:00',
    '16:30',
  ].map(t);

  it('includes the exact time when it is free', () => {
    expect(fmt(nearestSlots(day, t('14:00'), 3))).toEqual([
      '14:00',
      '14:30',
      '15:00',
    ]);
  });

  it('returns the closest times around a busy one, in order', () => {
    expect(fmt(nearestSlots(day, t('12:00'), 2))).toEqual(['10:00', '14:00']);
  });

  it('breaks ties toward the earlier time', () => {
    expect(fmt(nearestSlots(day, t('15:45'), 1))).toEqual(['15:00']);
  });

  it('handles fewer slots than requested', () => {
    expect(fmt(nearestSlots([t('09:00')], t('14:00'), 4))).toEqual(['09:00']);
  });
});
