import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  uuidExtension: 'pgcrypto',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
});
