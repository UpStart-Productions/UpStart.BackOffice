import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = (req as Request & { requestId?: string }).requestId;

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const response =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    let message: string;
    if (typeof response === 'object' && response !== null && 'message' in response) {
      const msg = (response as { message?: string | string[] }).message;
      message = Array.isArray(msg) ? msg.join('; ') : (msg ?? 'Unknown error');
    } else if (typeof response === 'string') {
      message = response;
    } else {
      message = 'Unknown error';
    }

    const error = exception instanceof HttpException ? exception.name : 'Internal Server Error';

    this.logger.error(
      `[${requestId ?? 'unknown'}] ${status} ${exception instanceof Error ? exception.message : String(exception)}`,
    );

    res.status(status).json({
      statusCode: status,
      message,
      error,
      path: req.url ?? req.path ?? '/',
      ...(requestId ? { requestId } : {}),
    });
  }
}
