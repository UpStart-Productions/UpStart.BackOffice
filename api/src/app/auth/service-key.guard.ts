import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ServiceKeyService } from '../service-keys/service-key.service';

const API_KEY_HEADER = 'x-api-key';

/**
 * Guards service-to-service endpoints (e.g. POST /leads/ingest).
 * Validates the x-api-key header against active ServiceKey records.
 * Any external service with a valid generated key is granted access.
 */
@Injectable()
export class ServiceKeyGuard implements CanActivate {
  constructor(private readonly keys: ServiceKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request  = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[API_KEY_HEADER];
    const plainKey = typeof provided === 'string' ? provided.trim() : undefined;

    if (!plainKey) {
      throw new UnauthorizedException('API key required. Send x-api-key header.');
    }

    const record = await this.keys.validate(plainKey);
    if (!record) {
      throw new UnauthorizedException('Invalid or revoked API key.');
    }

    return true;
  }
}
