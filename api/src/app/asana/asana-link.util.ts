export function asanaBoardGids(project: {
  asanaProjectGid?: string | null;
  asanaProjectGids?: unknown;
}): string[] {
  if (Array.isArray(project.asanaProjectGids)) {
    return project.asanaProjectGids.filter((gid): gid is string => typeof gid === 'string' && gid.length > 0);
  }
  return project.asanaProjectGid ? [project.asanaProjectGid] : [];
}

export function asanaSectionGids(project: {
  asanaSectionGid?: string | null;
  asanaSectionGids?: unknown;
}): string[] {
  if (Array.isArray(project.asanaSectionGids)) {
    return project.asanaSectionGids.filter((gid): gid is string => typeof gid === 'string' && gid.length > 0);
  }
  return project.asanaSectionGid ? [project.asanaSectionGid] : [];
}

export function sameGidList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((gid, i) => gid === right[i]);
}
