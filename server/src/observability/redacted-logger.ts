import type { LoggerService, LogLevel } from '@nestjs/common';

type LogRecord = Readonly<{
  context: string;
  event: 'server-log';
  level: LogLevel;
  timestamp: string;
}>;

type LogSink = (record: LogRecord) => void;

function normalizeContext(context: string | undefined): string {
  if (context === undefined || context.length === 0) {
    return 'Application';
  }

  return context.replace(/[^A-Za-z0-9_.:/-]/g, '').slice(0, 80) || 'Application';
}

function writeRecord(record: LogRecord): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

export class RedactedLogger implements LoggerService {
  constructor(private readonly sink: LogSink = writeRecord) {}

  debug(_message: unknown, context?: string): void {
    this.emit('debug', context);
  }

  error(_message: unknown, _trace?: string, context?: string): void {
    this.emit('error', context);
  }

  fatal(_message: unknown, context?: string): void {
    this.emit('fatal', context);
  }

  log(_message: unknown, context?: string): void {
    this.emit('log', context);
  }

  verbose(_message: unknown, context?: string): void {
    this.emit('verbose', context);
  }

  warn(_message: unknown, context?: string): void {
    this.emit('warn', context);
  }

  private emit(level: LogLevel, context: string | undefined): void {
    this.sink(
      Object.freeze({
        context: normalizeContext(context),
        event: 'server-log',
        level,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
