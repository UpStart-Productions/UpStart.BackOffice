import type { Injector } from '@angular/core';

/**
 * Holds the root injector for the lazily loaded Quill icon toolbar handler (quill-lucide-icons.ts),
 * which runs outside Angular DI. Kept tiny so app startup doesn't load Quill or the icon paths.
 */
let rootInjector: Injector | null = null;

export function rememberQuillIconInjector(injector: Injector): void {
  rootInjector = injector;
}

export function quillIconInjector(): Injector | null {
  return rootInjector;
}
