import { IANAZone } from 'luxon';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    PUBLIC_BASE_URL: z.url(),
    RETELL_API_KEY: z.string().min(1),
    RETELL_AGENT_ID: z.string().min(1),
    CREDITS_PER_MINUTE: z.coerce
      .number()
      .positive()
      .max(100000)
      .multipleOf(0.01)
      .default(1),
    MIN_CALL_MINUTES: z.coerce.number().int().min(1).max(120).default(2),
    MAX_CALL_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.url().optional(),
    GOOGLE_TOKEN_ENC_KEY: z.string().optional(),
    DEFAULT_TIMEZONE: z
      .string()
      .default('Asia/Karachi')
      .refine((tz) => IANAZone.isValidZone(tz), {
        message:
          'DEFAULT_TIMEZONE must be a valid IANA timezone, e.g. Asia/Karachi',
      }),
    FRONTEND_URL: z.url().default('http://localhost:3000'),
    ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:5173'),
  })
  .refine((env) => env.MAX_CALL_MINUTES >= env.MIN_CALL_MINUTES, {
    path: ['MAX_CALL_MINUTES'],
    message: 'MAX_CALL_MINUTES must be at least MIN_CALL_MINUTES',
  });

export const validateEnv = (config: Record<string, unknown>) =>
  schema.parse(config);
