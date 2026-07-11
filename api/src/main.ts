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
  const raw = (process.env.CORS_ORIGINS?.split(',') ?? [])
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').replace(/\/$/, ''))
    .filter(Boolean);
  const expanded = new Set(raw);
  for (const origin of raw) {
    try {
      const { protocol, hostname } = new URL(origin);
      if (hostname === 'office.heyupstart.com') {
        expanded.add(`${protocol}//heyupstart.com`);
        expanded.add(`${protocol}//www.heyupstart.com`);
      } else if (hostname === 'heyupstart.com') {
        expanded.add(`${protocol}//www.heyupstart.com`);
      } else if (hostname === 'www.heyupstart.com') {
        expanded.add(`${protocol}//heyupstart.com`);
      }
    } catch {
      // ignore invalid URLs
    }
  }
  return [...expanded];
}

function isCorsOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  return allowed.includes(normalized) || allowed.includes(origin);
}

// Extension pages (side panel, background) send `chrome-extension://<id>` as
// their Origin header. Chrome does NOT exempt this from CORS just because
// the extension declares host_permissions -- the server still has to
// explicitly allow it, or the browser blocks reading the response (learned
// the hard way building the GrovLink Web Clipper extension against a
// similar API). Safe to allow broadly here since auth is Bearer
// token/x-user-email header, not cookies -- there's no CSRF exposure the
// way there would be with cookie-based sessions.
function isChromeExtensionOrigin(origin: string | undefined): boolean {
  return !!origin && /^chrome-extension:\/\//.test(origin);
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
    'accept',
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
        if (
          !origin ||
          isLocalhost ||
          isLocalNetwork ||
          isChromeExtensionOrigin(origin) ||
          isCorsOriginAllowed(origin, devOrigins)
        ) {
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
        if (isCorsOriginAllowed(origin, corsOrigins) || isChromeExtensionOrigin(origin)) {
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
