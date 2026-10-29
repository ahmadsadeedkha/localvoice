import { type ConnectionOptions } from 'bullmq';

/**
 * BullMQ takes connection options rather than a URL, so split REDIS_URL up.
 * `rediss://` (TLS) is common on hosted Redis, so it switches TLS on.
 */
export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  const db = u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number.isInteger(db) ? db : undefined,
    ...(u.protocol === 'rediss:' && { tls: {} }),
  };
}
