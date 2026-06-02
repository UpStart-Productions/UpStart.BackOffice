import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly header = 'x-request-id';

  use(req: Request, res: Response, next: NextFunction): void {
    const value = (req.headers[this.header] as string)?.trim() || randomUUID();
    (req as Request & { requestId?: string }).requestId = value;
    res.setHeader(this.header, value);
    next();
  }
}
