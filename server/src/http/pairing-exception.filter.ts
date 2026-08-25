import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';

import type { PairingErrorCode } from '../contracts/pairing-error-codes';
import { PairingServiceError } from './pairing-service-error';

type ErrorResponse = Readonly<{
  code: PairingErrorCode;
  schemaVersion: 1;
}>;

type HttpResponse = Readonly<{
  json(body: ErrorResponse): void;
  status(statusCode: number): HttpResponse;
}>;

@Catch()
export class PairingExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const failure = publicFailure(exception);
    response.status(failure.status).json({ code: failure.code, schemaVersion: 1 });
  }
}

function publicFailure(exception: unknown): Readonly<{ code: PairingErrorCode; status: number }> {
  if (exception instanceof PairingServiceError) {
    return exception;
  }

  if (isPayloadTooLarge(exception)) {
    return new PairingServiceError('request-body-too-large');
  }

  if (exception instanceof HttpException) {
    switch (exception.getStatus()) {
      case 400:
        return new PairingServiceError('request-invalid');
      case 404:
        return new PairingServiceError('route-not-found');
      case 413:
        return new PairingServiceError('request-body-too-large');
      case 429:
        return new PairingServiceError('rate-limited');
      default:
        return new PairingServiceError('internal-error');
    }
  }

  return new PairingServiceError('internal-error');
}

function isPayloadTooLarge(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const candidate = exception as { status?: unknown; statusCode?: unknown; type?: unknown };
  return (
    candidate.status === 413 ||
    candidate.statusCode === 413 ||
    candidate.type === 'entity.too.large'
  );
}
