import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { clerkMiddleware } from '@clerk/express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  const origins = config
    .get<string>('ALLOWED_ORIGINS')!
    .split(',')
    .map((o) => o.trim());

  // CORS first, so preflight requests are answered before auth runs
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  app.use(
    clerkMiddleware({
      publishableKey: config.get<string>('CLERK_PUBLISHABLE_KEY'),
      secretKey: config.get<string>('CLERK_SECRET_KEY'),
      authorizedParties: origins,
    }),
  );

  await app.listen(config.get<number>('PORT') ?? 4000);
}
void bootstrap();
