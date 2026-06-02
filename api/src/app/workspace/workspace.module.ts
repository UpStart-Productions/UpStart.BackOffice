import { Module } from '@nestjs/common';
import { WorkspaceMiddleware } from './workspace.middleware';

@Module({
  providers: [WorkspaceMiddleware],
  exports: [WorkspaceMiddleware],
})
export class WorkspaceModule {}
