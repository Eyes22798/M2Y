import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import 'reflect-metadata';

import { AppModule } from './app.module';
import { configureApplication } from './bootstrap/configure-application';
import { SERVER_CONFIG, type ServerConfig } from './bootstrap/server-config';
import { RedactedLogger } from './observability/redacted-logger';

export async function bootstrap(): Promise<void> {
  const application = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    bufferLogs: true,
    logger: new RedactedLogger(),
    rawBody: true,
  });
  application.useBodyParser('json', { limit: '32kb' });
  configureApplication(application);

  const config = application.get<ServerConfig>(SERVER_CONFIG);
  await application.listen(config.port, config.host);
}

if (require.main === module) {
  void bootstrap();
}
