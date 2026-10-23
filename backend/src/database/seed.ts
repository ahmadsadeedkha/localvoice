/**
 * Dev seed: gives a tenant a timezone, a default resource, a few services and business hours.
 * Idempotent: safe to run repeatedly; it only fills in what is missing.
 *
 * Usage:
 *   pnpm seed                 (works if you have exactly one tenant)
 *   pnpm seed <tenantId>      (required if you have several)
 *   SEED_TIMEZONE=America/Chicago pnpm seed <tenantId>
 */
import dataSource from './data-source';

const TIMEZONE = process.env.SEED_TIMEZONE ?? 'Asia/Karachi';

const SERVICES = [
  { name: 'Consultation', description: 'Short intro consultation', duration: 30 },
  { name: 'Standard appointment', description: 'Regular one-hour appointment', duration: 60 },
  { name: 'Extended session', description: 'Longer session for bigger jobs', duration: 90 },
];

type Hours = [dayOfWeek: number, open: string, close: string];

// 0 = Sunday ... 6 = Saturday. Weekdays are split by a lunch break on purpose,
// so multi-interval days get exercised. Sunday is closed.
const HOURS: Hours[] = [
  ...[1, 2, 3, 4, 5].flatMap((d): Hours[] => [
    [d, '09:00', '13:00'],
    [d, '14:00', '18:00'],
  ]),
  [6, '10:00', '14:00'],
];

async function main() {
  await dataSource.initialize();

  const tenants: { id: string; name: string }[] = await dataSource.query(
    `SELECT id, name FROM tenants`,
  );
  const arg = process.argv[2];

  let tenant = arg ? tenants.find((t) => t.id === arg) : undefined;
  if (!arg && tenants.length === 1) tenant = tenants[0];

  if (!tenant) {
    console.error(
      arg ? `No tenant with id ${arg}.` : 'Several tenants found, pass one as an argument:',
    );
    tenants.forEach((t) => console.error(`  ${t.id}  ${t.name}`));
    process.exit(1);
  }

  await dataSource.transaction(async (m) => {
    await m.query(`UPDATE tenants SET timezone = $1 WHERE id = $2`, [TIMEZONE, tenant!.id]);

        await m.query(
          `INSERT INTO resources (tenant_id, name)
       SELECT $1::uuid, 'Default'
       WHERE NOT EXISTS (SELECT 1 FROM resources WHERE tenant_id = $1::uuid)`,
          [tenant!.id],
        );

        for (const s of SERVICES) {
          await m.query(
            `INSERT INTO services (tenant_id, name, description, duration_minutes)
         SELECT $1::uuid, $2::varchar, $3::text, $4::int
         WHERE NOT EXISTS (
           SELECT 1 FROM services WHERE tenant_id = $1::uuid AND name = $2::varchar
         )`,
            [tenant!.id, s.name, s.description, s.duration],
          );
        }

    const [{ count }] = await m.query(
      `SELECT count(*)::int AS count FROM business_hours WHERE tenant_id = $1`,
      [tenant!.id],
    );
    if (count === 0) {
      for (const [dow, open, close] of HOURS) {
        await m.query(
          `INSERT INTO business_hours (tenant_id, day_of_week, open_time, close_time)
           VALUES ($1, $2, $3, $4)`,
          [tenant!.id, dow, open, close],
        );
      }
    }
  });

  console.log(`Seeded tenant "${tenant.name}" (${tenant.id}), timezone ${TIMEZONE}`);
  console.log('Test call:  POST /dev/calls/web  with  { "tenantId": "' + tenant.id + '" }');
  await dataSource.destroy();
}

main().catch(async (e) => {
  console.error(e);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
