import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';

import { AppModule } from './app.module';
import { SERVER_CONFIG, type ServerConfig } from './bootstrap/server-config';
import { RedactedLogger } from './observability/redacted-logger';

export async function bootstrap(): Promise<void> {
  const application = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: new RedactedLogger(),
  });
  application.enableShutdownHooks();
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: false,
      whitelist: true,
    }),
  );

  const config = application.get<ServerConfig>(SERVER_CONFIG);
  await application.listen(config.port, config.host);
}

if (require.main === module) {
  void bootstrap();
}
