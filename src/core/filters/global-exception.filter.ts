import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface RequestWithId extends Request {
  requestId: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

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

    // Log the error with request context
    this.logger.error(`Request failed: ${request.method} ${request.url}`, {
      requestId,
      status,
      message,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      timestamp: new Date().toISOString(),
      stack: details,
    });

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
