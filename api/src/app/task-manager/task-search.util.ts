import type { Prisma } from '@prisma/client';
import { insensitiveContains } from '../search/text-search.util';

/** Substring match across task body, people, tags, subtasks, comments, attachments, and custom fields. */
export function taskSearchWhere(q: string): Prisma.TaskWhereInput {
  const ic = insensitiveContains(q);
  return {
    OR: [
      { name: ic },
      { description: ic },
      { submitterName: ic },
      { submitterEmail: ic },
      { tags: { some: { tag: { name: ic } } } },
      {
        assignee: {
          OR: [{ firstName: ic }, { lastName: ic }, { name: ic }, { email: ic }],
        },
      },
      {
        createdBy: {
          OR: [{ firstName: ic }, { lastName: ic }, { name: ic }, { email: ic }],
        },
      },
      { comments: { some: { kind: 'COMMENT', body: ic } } },
      { subtasks: { some: { name: ic } } },
      { attachments: { some: { OR: [{ fileName: ic }, { url: ic }] } } },
      { fieldValues: { some: { value: { string_contains: q } } } },
    ],
  };
}
