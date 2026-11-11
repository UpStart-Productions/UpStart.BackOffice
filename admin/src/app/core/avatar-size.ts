/** Canonical user avatar scale — only `sm` | `med` | `lg` (see `.cursor/rules/avatar-sizes.mdc`). */
export type AvatarSize = 'sm' | 'med' | 'lg';

export const AVATAR_SIZE_PX: Record<AvatarSize, number> = {
  sm: 22,
  med: 28,
  lg: 36,
};

export function avatarSizePx(size: AvatarSize): number {
  return AVATAR_SIZE_PX[size];
}

/** Round avatar element: `ubo-avatar ubo-avatar--sm` (etc.). */
export function avatarSizeClasses(size: AvatarSize): string {
  return `ubo-avatar ubo-avatar--${size}`;
}

/** Host marker on `app-person` / `app-tm-avatar` for layout hooks. */
export function avatarHostSizeClass(size: AvatarSize): string {
  return `ubo-avatar-size-${size}`;
}
