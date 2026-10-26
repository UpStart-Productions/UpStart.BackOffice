/** Authors may edit or delete their own task comments within this window after posting. */
export const TASK_COMMENT_AUTHOR_GRACE_MS = 60 * 60 * 1000;

export function withinTaskCommentAuthorGrace(createdAt: string | Date, now = Date.now()): boolean {
  const then = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime();
  if (Number.isNaN(then)) return false;
  return now - then <= TASK_COMMENT_AUTHOR_GRACE_MS;
}
