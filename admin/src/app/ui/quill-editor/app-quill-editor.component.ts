import { booleanAttribute, Component, computed, forwardRef, inject, input, output } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import type Quill from 'quill';
import {
  MentionCandidatesService,
  type MentionQuillContext,
  type MentionQuillModuleOptions,
  type MentionQuillToolbar,
} from '../../core/mention-candidates.service';

/**
 * Canonical rich-text field: Quill + API @mentions on every instance.
 * Drop-in for `<quill-editor>` with `mentionClientId` / `mentionProjectId` / `mentionToolbar`.
 */
@Component({
  selector: 'app-quill-editor',
  standalone: true,
  imports: [QuillModule, FormsModule],
  template: `
    <quill-editor
      [modules]="resolvedModules()"
      [(ngModel)]="innerValue"
      (ngModelChange)="onInnerChange($event)"
      [placeholder]="placeholder()"
      [readOnly]="readOnly()"
      [styles]="styles()"
      [id]="id()"
      [name]="name()"
      [class]="editorClass()"
      [attr.aria-label]="ariaLabel()"
      (onEditorCreated)="onEditorCreated.emit($event)"
      (onBlur)="onBlurEvent($event)"
    />
  `,
  host: {
    class: 'app-quill-editor',
    '[class]': 'hostClass()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppQuillEditorComponent),
      multi: true,
    },
  ],
})
export class AppQuillEditorComponent implements ControlValueAccessor {
  private readonly mentions = inject(MentionCandidatesService);

  readonly mentionClientId = input<string | null | undefined>(undefined);
  readonly mentionProjectId = input<string | null | undefined>(undefined);
  /** `activity` = org activity log mention scope (see mentions API). */
  readonly mentionContext = input<MentionQuillContext | undefined>(undefined);
  readonly mentionToolbar = input<MentionQuillToolbar | 'minimal' | 'full'>('full');

  readonly placeholder = input<string | undefined>(undefined);
  readonly readOnly = input(false, { transform: booleanAttribute });
  readonly styles = input<Record<string, string> | null>(null);
  readonly id = input<string | undefined>(undefined);
  readonly name = input<string | undefined>(undefined);
  /** Applied to the inner `quill-editor` (e.g. `tm-description-editor`). */
  readonly editorClass = input<string | undefined>(undefined, { alias: 'class' });
  /** Applied to the host wrapper. */
  readonly hostClass = input<string | undefined>(undefined);
  readonly ariaLabel = input<string | undefined>(undefined, { alias: 'aria-label' });

  readonly onEditorCreated = output<Quill>();
  readonly onBlur = output<unknown>();

  innerValue: string | null = null;
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  readonly resolvedModules = computed(() => {
    const toolbar = this.mentionToolbar();
    const resolvedToolbar: MentionQuillModuleOptions['toolbar'] | undefined =
      toolbar === 'minimal'
        ? [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link']]
        : toolbar === 'full'
          ? undefined
          : toolbar;
    const ctx = this.mentionContext();
    return this.mentions.quillModules({
      clientId: this.mentionClientId() ?? null,
      projectId: this.mentionProjectId() ?? null,
      ...(ctx === 'activity' ? { context: 'activity' as const } : {}),
      ...(resolvedToolbar !== undefined ? { toolbar: resolvedToolbar } : {}),
    });
  });

  writeValue(value: string | null): void {
    this.innerValue = value;
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onInnerChange(value: string | null): void {
    this.innerValue = value;
    this.onChange(value);
  }

  onBlurEvent(event: unknown): void {
    this.onTouched();
    this.onBlur.emit(event);
  }
}
