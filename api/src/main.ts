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

const uploadsPath = path.join(process.cwd(), 'uploads');

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '10mb';

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
    'x-impersonate-user-id',
    'x-super-admin',
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

    app.enableCors({
      origin: (origin, callback) => {
        const isLocalhost = origin && /^https?:\/\/localhost(:\d+)?$/.test(origin);
        const isLocalNetwork =
          origin &&
          /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (!origin || isLocalhost || isLocalNetwork) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      allowedHeaders,
    });
  } else {
    const corsOrigins = (process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) ?? []).filter(Boolean);
    const allowLocalNetwork = process.env.CORS_ALLOW_LOCAL_NETWORK === 'true';
    Logger.log(`CORS: ${corsOrigins.length} origin(s) configured`);
    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        if (allowLocalNetwork && origin) {
          const isLocal = /^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin);
          if (isLocal) { callback(null, true); return; }
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      allowedHeaders,
    });
  }

  app.setGlobalPrefix('api');
  app.useStaticAssets(uploadsPath, { prefix: '/api/uploads/', index: false });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(`Storage: ${process.env.STORAGE_PROVIDER === 's3' ? 'S3' : 'local'}`);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
}

bootstrap();
