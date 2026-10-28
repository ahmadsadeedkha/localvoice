import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const MAX_INTERVALS_PER_DAY = 4;

const serviceName = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(120, 'Name must be 120 characters or fewer');

const serviceDescription = z
  .string()
  .trim()
  .max(500, 'Description must be 500 characters or fewer')
  .nullable();

const durationMinutes = z
  .number('Duration must be a number')
  .int('Duration must be a whole number of minutes')
  .min(5, 'Duration must be at least 5 minutes')
  .max(480, 'Duration can be at most 8 hours')
  .multipleOf(5, 'Duration must be a multiple of 5 minutes');

export const createServiceSchema = z.object({
  name: serviceName,
  description: serviceDescription.optional(),
  durationMinutes,
});

export const updateServiceSchema = z
  .object({
    name: serviceName,
    description: serviceDescription,
    durationMinutes,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times must look like 09:00 (24-hour)');

export const hoursSchema = z
  .object({
    hours: z.array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        openTime: time,
        closeTime: time,
      }),
    ),
  })
  .superRefine(({ hours }, ctx) => {
    for (let day = 0; day < 7; day++) {
      const intervals = hours
        .filter((h) => h.dayOfWeek === day)
        .sort((a, b) => a.openTime.localeCompare(b.openTime));
      const name = DAY_NAMES[day];

      if (intervals.length > MAX_INTERVALS_PER_DAY) {
        ctx.addIssue({
          code: 'custom',
          message: `${name} can have at most ${MAX_INTERVALS_PER_DAY} opening periods`,
        });
        return;
      }
      for (let i = 0; i < intervals.length; i++) {
        if (intervals[i].closeTime <= intervals[i].openTime) {
          ctx.addIssue({
            code: 'custom',
            message: `${name}: closing time must be after opening time`,
          });
          return;
        }
        if (i > 0 && intervals[i].openTime < intervals[i - 1].closeTime) {
          ctx.addIssue({
            code: 'custom',
            message: `${name}: opening periods overlap`,
          });
          return;
        }
      }
    }
  });

export type CreateServiceInput = z.output<typeof createServiceSchema>;
export type UpdateServiceInput = z.output<typeof updateServiceSchema>;
export type HoursInput = z.output<typeof hoursSchema>;

/** Validates an untrusted request body; the first problem becomes a 400 message. */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues[0]?.message ?? 'Invalid request',
    );
  }
  return result.data;
}
