import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({ name: 'simpleMarkdown', standalone: true, pure: true })
export class SimpleMarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(toHtml(value ?? ''));
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g, '<em>$1</em>');
}

function toHtml(raw: string): string {
  const lines = escapeHtml(raw).split('\n');
  const blocks: string[] = [];
  let listBuffer: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paraBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length && listType) {
      blocks.push(`<${listType}>${listBuffer.join('')}</${listType}>`);
    }
    listBuffer = [];
    listType = null;
  };
  const flushPara = () => {
    if (paraBuffer.length) {
      blocks.push(`<p>${paraBuffer.join('<br>')}</p>`);
    }
    paraBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)/);

    if (bulletMatch) {
      flushPara();
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(`<li>${inlineFormat(bulletMatch[1])}</li>`);
    } else if (numberedMatch) {
      flushPara();
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(`<li>${inlineFormat(numberedMatch[1])}</li>`);
    } else if (trimmed === '') {
      flushList();
      flushPara();
    } else {
      flushList();
      paraBuffer.push(inlineFormat(trimmed));
    }
  }
  flushList();
  flushPara();

  return blocks.join('');
}
