import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TelegramLoggerService } from '../telegram-logger/telegram-logger.service';

interface RequestWithId extends Request {
  requestId: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly telegramLogger?: TelegramLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || exception.message;
        details = (exceptionResponse as any).error || null;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      details = exception.stack;
    }

    // Only log as error for server errors (5xx) or unexpected errors
    // Client errors (4xx) are logged as warnings or debug
    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const isClientError = status >= HttpStatus.BAD_REQUEST && status < HttpStatus.INTERNAL_SERVER_ERROR;
    const isUnexpectedError = !(exception instanceof HttpException);

    if (isServerError || isUnexpectedError) {
      this.logger.error(`Request failed: ${request.method} ${request.url}`, {
        requestId,
        status,
        message,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        timestamp: new Date().toISOString(),
        stack: details,
      });
    } else if (isClientError) {
      // Client errors (4xx) are expected and shouldn't be logged as errors
      this.logger.debug(`Client error: ${request.method} ${request.url} - ${status} ${message}`, {
        requestId,
        status,
        message,
      });
    }

    // Only send to Telegram for server errors (5xx) or unexpected errors
    // Don't send client errors (4xx) like 401, 403, 404, etc.
    if (this.telegramLogger && (isServerError || isUnexpectedError)) {
      const errorContext = {
        method: request.method,
        url: request.url,
        status,
        requestId,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        timestamp: new Date().toISOString(),
      };

      const errorMessage =
        exception instanceof Error
          ? exception
          : new Error(`HTTP ${status}: ${message}`);

      // Don't await - send asynchronously
      this.telegramLogger.sendError(errorMessage, errorContext).catch((err) => {
        this.logger.warn(`Failed to send error to Telegram: ${err.message}`);
      });
    }

    // Don't expose stack traces in production
    const isProduction = process.env.NODE_ENV === 'production';
    const errorResponse = {
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
      ...(isProduction ? {} : { details }),
    };

    response.status(status).json(errorResponse);
  }
}
