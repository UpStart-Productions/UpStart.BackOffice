import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: true });

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app/app.module';
import { HttpExceptionFilter } from './app/common/http-exception.filter';

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '10mb';

const CORS_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'] as const;

function parseCorsOrigins(): string[] {
  return (process.env.CORS_ORIGINS?.split(',') ?? [])
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').replace(/\/$/, ''))
    .filter(Boolean);
}

function isCorsOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  return allowed.includes(normalized) || allowed.includes(origin);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.enableShutdownHooks();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const isDev = process.env.NODE_ENV !== 'production';

  const allowedHeaders = [
    'authorization',
    'x-request-id',
    'x-user-email',
    'x-user-role',
    'x-impersonate-user-id',
    'content-type',
  ];

  if (isDev) {
    const config = new DocumentBuilder()
      .setTitle('UpStart Back Office API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    const devOrigins = parseCorsOrigins();
    app.enableCors({
      origin: (origin, callback) => {
        const isLocalhost = origin && /^https?:\/\/localhost(:\d+)?$/.test(origin);
        const isLocalNetwork =
          origin &&
          /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (!origin || isLocalhost || isLocalNetwork || isCorsOriginAllowed(origin, devOrigins)) {
          callback(null, true);
        } else {
          Logger.warn(`CORS blocked origin: "${origin}"`);
          callback(null, false);
        }
      },
      credentials: true,
      allowedHeaders,
      methods: [...CORS_METHODS],
    });
  } else {
    const corsOrigins = parseCorsOrigins();
    const allowLocalNetwork = process.env.CORS_ALLOW_LOCAL_NETWORK === 'true';
    if (corsOrigins.length === 0) {
      Logger.error(
        'CORS_ORIGINS is empty — set comma-separated admin URLs (e.g. https://office.heyupstart.com)',
      );
    } else {
      Logger.log(`CORS: ${corsOrigins.length} origin(s): ${corsOrigins.join(', ')}`);
    }
    app.enableCors({
      origin: (origin, callback) => {
        if (isCorsOriginAllowed(origin, corsOrigins)) {
          callback(null, true);
          return;
        }
        if (allowLocalNetwork && origin) {
          const isLocal = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin);
          if (isLocal) { callback(null, true); return; }
        }
        Logger.warn(`CORS blocked origin: "${origin}" (allowed: ${corsOrigins.join(', ') || 'none'})`);
        callback(null, false);
      },
      credentials: true,
      allowedHeaders,
      methods: [...CORS_METHODS],
    });
  }

  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(`Storage: ${process.env.STORAGE_PROVIDER === 's3' ? 'S3' : 'local'}`);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
}

bootstrap();
