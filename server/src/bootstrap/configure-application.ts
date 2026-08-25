import { type INestApplication, ValidationPipe } from '@nestjs/common';

import { PairingExceptionFilter } from '../http/pairing-exception.filter';
import { PairingServiceError } from '../http/pairing-service-error';

export function configureApplication(application: INestApplication): void {
  application.enableShutdownHooks();
  application.useGlobalFilters(new PairingExceptionFilter());
  application.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: () => new PairingServiceError('request-invalid'),
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: false,
      whitelist: true,
    }),
  );
}
