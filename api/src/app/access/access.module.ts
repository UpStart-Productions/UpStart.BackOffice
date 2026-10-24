import { Global, Module } from '@nestjs/common';
import { AccessGuard } from './access.guard';
import { AccessService } from './access.service';

@Global()
@Module({ providers: [AccessService, AccessGuard], exports: [AccessService, AccessGuard] })
export class AccessModule {}
