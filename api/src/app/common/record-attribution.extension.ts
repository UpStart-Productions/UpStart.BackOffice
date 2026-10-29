import { Prisma } from '@prisma/client';
import { applyAttributionToArgs } from './record-attribution';

export const recordAttributionExtension = Prisma.defineExtension({
  name: 'record-attribution',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        applyAttributionToArgs(
          model,
          operation,
          args as { data?: unknown; create?: unknown; update?: unknown },
        );
        return query(args);
      },
    },
  },
});
