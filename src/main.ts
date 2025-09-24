import { NestFactory } from '@nestjs/core';
import { IndexModule } from './index.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
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
  // ) || ['http://localhost:3000', 'https://flovo.kydanza.me'];

  app.enableCors({
    origin: '*',
  });

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

  // Swagger (OpenAPI) setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Flovo API')
    .setDescription('REST API documentation for Flovo backend')
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
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'Flovo API Docs',
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api-docs`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
}
bootstrap();
