import { BadRequestException } from '@nestjs/common';
import {
  createServiceSchema,
  hoursSchema,
  parseBody,
  updateServiceSchema,
} from './business.schemas';

const hours = (...h: [number, string, string][]) => ({
  hours: h.map(([dayOfWeek, openTime, closeTime]) => ({
    dayOfWeek,
    openTime,
    closeTime,
  })),
});

describe('createServiceSchema', () => {
  it('accepts a valid service and trims the name', () => {
    const out = parseBody(createServiceSchema, {
      name: '  Haircut ',
      durationMinutes: 30,
    });
    expect(out.name).toBe('Haircut');
  });

  it.each([
    [{ name: '', durationMinutes: 30 }, 'Name is required'],
    [{ name: '   ', durationMinutes: 30 }, 'Name is required'],
    [{ name: 'A', durationMinutes: 0 }, 'at least 5'],
    [{ name: 'A', durationMinutes: 7 }, 'multiple of 5'],
    [{ name: 'A', durationMinutes: 481 }, 'at most 8 hours'],
    [{ name: 'A', durationMinutes: 12.5 }, 'whole number'],
    [{ name: 'A', durationMinutes: '30' }, 'must be a number'],
    [{ name: 'x'.repeat(121), durationMinutes: 30 }, '120 characters'],
  ])('rejects %j', (body, fragment) => {
    expect(() => parseBody(createServiceSchema, body)).toThrow(
      BadRequestException,
    );
    expect(() => parseBody(createServiceSchema, body)).toThrow(fragment);
  });
});

describe('updateServiceSchema', () => {
  it('allows a partial update and clearing the description', () => {
    expect(parseBody(updateServiceSchema, { active: false })).toEqual({
      active: false,
    });
    expect(parseBody(updateServiceSchema, { description: null })).toEqual({
      description: null,
    });
  });

  it('rejects an empty update', () => {
    expect(() => parseBody(updateServiceSchema, {})).toThrow(
      'Nothing to update',
    );
  });
});

describe('hoursSchema', () => {
  it('accepts split shifts and closed days', () => {
    expect(() =>
      parseBody(
        hoursSchema,
        hours(
          [1, '09:00', '12:00'],
          [1, '13:00', '17:00'],
          [2, '09:00', '17:00'],
        ),
      ),
    ).not.toThrow();
    expect(() => parseBody(hoursSchema, hours())).not.toThrow(); // every day closed
  });

  it('accepts back-to-back periods (touching, not overlapping)', () => {
    expect(() =>
      parseBody(
        hoursSchema,
        hours([1, '09:00', '12:00'], [1, '12:00', '17:00']),
      ),
    ).not.toThrow();
  });

  it('rejects closing at or before opening, naming the day', () => {
    expect(() => parseBody(hoursSchema, hours([3, '17:00', '09:00']))).toThrow(
      'Wednesday: closing time must be after opening time',
    );
    expect(() => parseBody(hoursSchema, hours([3, '09:00', '09:00']))).toThrow(
      'Wednesday',
    );
  });

  it('rejects overlapping periods regardless of the order sent', () => {
    expect(() =>
      parseBody(
        hoursSchema,
        hours([5, '13:00', '18:00'], [5, '09:00', '14:00']),
      ),
    ).toThrow('Friday: opening periods overlap');
  });

  it('rejects malformed times and bad days', () => {
    expect(() => parseBody(hoursSchema, hours([1, '9:00', '17:00']))).toThrow(
      '24-hour',
    );
    expect(() => parseBody(hoursSchema, hours([1, '09:00', '24:00']))).toThrow(
      '24-hour',
    );
    expect(() => parseBody(hoursSchema, hours([7, '09:00', '17:00']))).toThrow(
      BadRequestException,
    );
  });

  it('rejects more than 4 periods in a day', () => {
    expect(() =>
      parseBody(
        hoursSchema,
        hours(
          [1, '06:00', '07:00'],
          [1, '08:00', '09:00'],
          [1, '10:00', '11:00'],
          [1, '12:00', '13:00'],
          [1, '14:00', '15:00'],
        ),
      ),
    ).toThrow('at most 4');
  });
});
