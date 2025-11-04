import { NestFactory } from '@nestjs/core';
import { IndexModule } from './index.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { TelegramLoggerService } from './core/telegram-logger/telegram-logger.service';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(IndexModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security middleware
  app.use(helmet());

  // Request ID middleware
  // app.use((req: any, res: any, next: any) => {
  //   const requestId = req.headers['x-request-id'] || require('uuid').v4();
  //   req.requestId = requestId;
  //   res.setHeader('x-request-id', requestId);
  //   next();
  // });

  // CORS configuration
  // const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((s) =>
  //   s.trim(),
  // ) || ['http://localhost:3000', 'https://aletis.kydanza.me'];

  app.enableCors({
    origin: '*',
  });

  // Global exception filter (with dependency injection)
  const telegramLogger = app.get(TelegramLoggerService);
  app.useGlobalFilters(new GlobalExceptionFilter(telegramLogger));

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.setGlobalPrefix('api');
  // Swagger (OpenAPI) setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Aletis API')
    .setDescription('REST API documentation for Aletis backend')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
        name: 'Authorization',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'Aletis API Docs',
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/docs`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
}
bootstrap();
