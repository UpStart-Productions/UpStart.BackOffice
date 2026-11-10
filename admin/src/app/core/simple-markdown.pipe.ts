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
    return path
      ? `<a class="side-list-title" data-app-link href="${path.replace(/"/g, '%22')}">${label}</a>`
      : label;
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

/** Turn "item — a — b — c" list lines into a title line plus nested `-` detail lines (no em dashes). */
function splitEmDashesInListLines(raw: string): string {
  return raw
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      const prefixMatch = trimmed.match(/^(\d+[.)]\s+|[-*]\s+)/);
      if (!prefixMatch || !/[\u2014—]/.test(trimmed)) return line;
      const prefix = prefixMatch[0];
      const rest = trimmed.slice(prefix.length);
      const parts = rest
        .split(/\s[\u2014—]\s/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length <= 1) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      const [head, ...tails] = parts;
      const sub = tails.map((t) => `${indent}   - ${t}`).join('\n');
      return `${indent}${prefix}${head}\n${sub}`;
    })
    .map((line) => (/[\u2014—]/.test(line) ? line.replace(/\s[\u2014—]\s/g, ', ') : line))
    .join('\n');
}

interface RecordRow {
  title: string;
  details: string[];
}

function rowTitleHtml(html: string): string {
  if (/<a\s+[^>]*data-app-link/.test(html)) {
    return html;
  }
  return `<span class="side-list-title">${html}</span>`;
}

function renderRecordRows(rows: RecordRow[]): string {
  const body = rows
    .map((r) => {
      const details = r.details.map((d) => `<span class="side-list-detail">${d}</span>`).join('');
      return `<div class="side-list-row"><div class="side-list-body">${rowTitleHtml(r.title)}${details}</div></div>`;
    })
    .join('');
  return `<div class="side-list">${body}</div>`;
}

function toHtml(raw: string, appLinks = false): string {
  const format = (text: string) => inlineFormat(appLinks ? linkify(text) : text);
  const lines = escapeHtml(splitEmDashesInListLines(raw)).split('\n');
  const blocks: string[] = [];
  let inRows = false;
  let rowBuffer: RecordRow[] = [];
  let paraBuffer: string[] = [];

  const flushList = () => {
    if (inRows && rowBuffer.length) {
      blocks.push(renderRecordRows(rowBuffer));
      rowBuffer = [];
      inRows = false;
    }
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
    const nested = (line.match(/^(\s*)/)?.[1]?.length ?? 0) >= 2;

    if (headingMatch) {
      flushList();
      flushPara();
      blocks.push(`<p class="m-0 mb-2"><strong>${format(headingMatch[1])}</strong></p>`);
    } else if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flushList();
      flushPara();
      blocks.push('<hr>');
    } else if (bulletMatch) {
      flushPara();
      if (nested && inRows && rowBuffer.length > 0) {
        rowBuffer[rowBuffer.length - 1].details.push(format(bulletMatch[1]));
        continue;
      }

      flushList();
      inRows = true;
      rowBuffer.push({ title: format(bulletMatch[1]), details: [] });
    } else if (numberedMatch) {
      flushPara();
      flushList();
      inRows = true;
      rowBuffer.push({ title: format(numberedMatch[1]), details: [] });
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
