import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const isHttpException = exception instanceof HttpException;
    const message =
      isHttpException
        ? exception.getResponse()
        : { message: 'Erro interno do servidor' };

    if (status >= 500 || !isHttpException) {
      const err = exception as Error;
      this.logger.error(`[${status}] ${err?.message ?? String(exception)}`);
      if (err?.stack) {
        this.logger.error(err.stack);
      }
    }

    const isDev = process.env.NODE_ENV !== 'production';
    let body: Record<string, unknown> =
      typeof message === 'object' && message !== null
        ? { statusCode: status, ...(message as object) }
        : { statusCode: status, message };

    if (status === HttpStatus.INTERNAL_SERVER_ERROR && isDev && !isHttpException) {
      const err = exception as Error;
      body = {
        ...body,
        message: err?.message ?? 'Erro interno do servidor',
        error: err?.name ?? 'Error',
        ...(err?.stack ? { stack: err.stack } : {}),
      };
    }

    response.status(status).json(body);
  }
}
