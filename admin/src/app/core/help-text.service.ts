import { Injectable } from '@angular/core';
import { HELP_TEXT_REGISTRY } from './help-text.registry';

@Injectable({ providedIn: 'root' })
export class HelpTextService {
  get(key: string): string {
    return HELP_TEXT_REGISTRY[key] ?? '';
  }

  has(key: string): boolean {
    return key in HELP_TEXT_REGISTRY && HELP_TEXT_REGISTRY[key].length > 0;
  }
}
