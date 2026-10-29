import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { attributionAls } from './record-attribution';

@Injectable()
export class RecordAttributionMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    attributionAls.run({ userId: null }, () => next());
  }
}
