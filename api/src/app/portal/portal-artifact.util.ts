import type { Artifact } from '@prisma/client';

export function toPortalArtifact(artifact: Artifact) {
  return {
    id: artifact.id,
    type: artifact.type,
    title: artifact.title,
    fileSize: artifact.fileSize,
    mimeType: artifact.mimeType,
    url: artifact.type === 'LINK' ? artifact.url : null,
    content: artifact.type === 'NOTE' ? artifact.content : null,
    createdAt: artifact.createdAt.toISOString(),
  };
}
