import { Injectable, signal } from '@angular/core';

export interface HelpAgentPickOutlineRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Hover box while "point at something" is active. Lives in a root-level overlay because
 * position:fixed inside the help drawer (transform) does not align with the viewport.
 */
@Injectable({ providedIn: 'root' })
export class HelpAgentPickOverlayService {
  readonly rect = signal<HelpAgentPickOutlineRect | null>(null);
}
