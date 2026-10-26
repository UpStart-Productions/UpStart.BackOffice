import type Quill from 'quill';
import type { QuillPersonCardScope } from './quill-person-card.types';

type ScopeSource = QuillPersonCardScope | (() => QuillPersonCardScope);

const scopeByQuill = new WeakMap<Quill, ScopeSource>();

export function setQuillPersonCardScope(quill: Quill, scope: ScopeSource): void {
  scopeByQuill.set(quill, scope);
}

export function resolveQuillPersonCardScope(quill: Quill): QuillPersonCardScope {
  const source = scopeByQuill.get(quill);
  if (!source) return { type: 'crm' };
  return typeof source === 'function' ? source() : source;
}

/** Bind CRM-only person-card picker context to a Quill instance (ngx-quill `onEditorCreated`). */
export function bindQuillPersonCardScope(quill: Quill, scope: ScopeSource): void {
  setQuillPersonCardScope(quill, scope);
}
