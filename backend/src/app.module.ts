import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './config/env';
import { TenantsModule } from './tenants/tenant.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { CallsModule } from './calls/calls.module';
import { ToolsModule } from './tools/tools.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BusinessModule } from './business/business.module';
import { CustomersModule } from './customers/customers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        ssl:
          config.get<string>('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        uuidExtension: 'pgcrypto',
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    TenantsModule,
    WebhooksModule,
    AuthModule,
    AdminModule,
    CallsModule,
    ToolsModule,
    DashboardModule,
    BusinessModule,
    CustomersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
