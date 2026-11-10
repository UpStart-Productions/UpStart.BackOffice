import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * `appLinks`: render markdown links "[text](url)" that point to this app (same origin, or a path) as
 * `<a data-app-link href="/path">`; any other link stays plain text. Used by the Back Office guide, whose
 * answers can quote record data, so a crafted link in a record never becomes clickable.
 */
export type SimpleMarkdownOption = 'appLinks';

@Pipe({ name: 'simpleMarkdown', standalone: true, pure: true })
export class SimpleMarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined, option?: SimpleMarkdownOption): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(toHtml(value ?? '', option === 'appLinks'));
  }
}

/** Same-site path for a link target, or null when it points elsewhere (or isn't a usable URL). */
export function appLinkPath(raw: string): string | null {
  try {
    const url = new URL(raw.replace(/&amp;/g, '&'), window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function linkify(text: string): string {
  return text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const path = appLinkPath(href);
    return path ? `<a data-app-link href="${path.replace(/"/g, '%22')}">${label}</a>` : label;
  });
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

function toHtml(raw: string, appLinks = false): string {
  const format = (text: string) => (appLinks ? linkify(inlineFormat(text)) : inlineFormat(text));
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
    const headingMatch = trimmed.match(/^#{1,6}\s+(.*?)\s*#*$/);
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)/);

    if (headingMatch) {
      // Headings (# … ######) become one small heading style: chat answers don't need levels.
      flushList();
      flushPara();
      blocks.push(`<h4>${format(headingMatch[1])}</h4>`);
    } else if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      // --- / *** / ___ : a divider
      flushList();
      flushPara();
      blocks.push('<hr>');
    } else if (bulletMatch) {
      flushPara();
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listBuffer.push(`<li>${format(bulletMatch[1])}</li>`);
    } else if (numberedMatch) {
      flushPara();
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listBuffer.push(`<li>${format(numberedMatch[1])}</li>`);
    } else if (trimmed === '') {
      flushList();
      flushPara();
    } else {
      flushList();
      paraBuffer.push(format(trimmed));
    }
  }
  flushList();
  flushPara();

  return blocks.join('');
}
