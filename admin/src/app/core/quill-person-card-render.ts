import { resolveAssetUrl } from './asset-url.util';
import { avatarPalette, initials } from '../task-manager/core/tm-format.util';
import type { QuillPersonCardValue } from './quill-person-card.types';

const DATA = {
  contactId: 'data-contact-id',
  name: 'data-name',
  firstName: 'data-first-name',
  lastName: 'data-last-name',
  role: 'data-role',
  email: 'data-email',
  phone: 'data-phone',
  avatarUrl: 'data-avatar-url',
} as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function avatarInner(value: QuillPersonCardValue): string {
  const photo = resolveAssetUrl(value.avatarUrl);
  if (photo) {
    return `<img src="${escapeHtml(photo)}" alt="" />`;
  }
  const pal = avatarPalette(value.contactId);
  const label = initials({
    firstName: value.firstName,
    lastName: value.lastName,
    name: value.name,
    email: value.email,
  });
  return `<span class="bo-person-card__initials" style="background:${pal.bg};color:${pal.fg}">${escapeHtml(label)}</span>`;
}

function detail(text: string, href?: string, className = 'bo-person-card__line'): string {
  const body = href
    ? `<a href="${escapeHtml(href)}" class="bo-person-card__link">${escapeHtml(text)}</a>`
    : escapeHtml(text);
  return `<span class="${className}">${body}</span>`;
}

/** Self-contained business-card markup (saved in note HTML and shown in read-only ql-editor views). */
export function personCardInnerHtml(value: QuillPersonCardValue): string {
  const role = value.role?.trim();
  const email = value.email?.trim();
  const phone = value.phone?.trim();
  const lines: string[] = [];
  if (role) lines.push(detail(role, undefined, 'bo-person-card__role'));
  if (email) lines.push(detail(email, `mailto:${email}`));
  if (phone) lines.push(detail(phone, `tel:${phone.replace(/\s/g, '')}`));

  return `<span class="bo-person-card__inner">
    <span class="bo-person-card__avatar">${avatarInner(value)}</span>
    <span class="bo-person-card__body">
      <span class="bo-person-card__name">${escapeHtml(value.name)}</span>
      ${lines.join('')}
    </span>
  </span>`;
}

export function applyPersonCardAttributes(node: HTMLElement, value: QuillPersonCardValue): void {
  node.setAttribute(DATA.contactId, value.contactId);
  node.setAttribute(DATA.name, value.name);
  node.setAttribute(DATA.firstName, value.firstName);
  node.setAttribute(DATA.lastName, value.lastName ?? '');
  node.setAttribute(DATA.role, value.role ?? '');
  node.setAttribute(DATA.email, value.email);
  node.setAttribute(DATA.phone, value.phone);
  node.setAttribute(DATA.avatarUrl, value.avatarUrl ?? '');
}

function readLabeledLine(card: HTMLElement, label: string): string | null {
  const labels = Array.from(card.querySelectorAll('.bo-person-card__label'));
  for (const el of labels) {
    if (el.textContent?.trim() !== label) continue;
    const line = el.closest('.bo-person-card__line');
    const link = line?.querySelector('a.bo-person-card__link');
    if (link) return link.textContent?.trim() || null;
    const text = line?.textContent?.replace(el.textContent ?? '', '').trim();
    return text || null;
  }
  return null;
}

export function personCardValueFromDom(node: HTMLElement): QuillPersonCardValue {
  const fromAttrs: QuillPersonCardValue = {
    contactId: node.getAttribute(DATA.contactId) ?? '',
    name: node.getAttribute(DATA.name) ?? '',
    firstName: node.getAttribute(DATA.firstName) ?? '',
    lastName: node.getAttribute(DATA.lastName) || null,
    role: node.getAttribute(DATA.role) || null,
    email: node.getAttribute(DATA.email) ?? '',
    phone: node.getAttribute(DATA.phone) ?? '',
    avatarUrl: node.getAttribute(DATA.avatarUrl) || null,
  };

  const nameFromDom = node.querySelector('.bo-person-card__name')?.textContent?.trim() ?? '';
  const roleFromDom =
    fromAttrs.role?.trim() ||
    node.querySelector('.bo-person-card__role')?.textContent?.trim() ||
    readLabeledLine(node, 'Role') ||
    null;
  const emailFromDom =
    fromAttrs.email.trim() ||
    node.querySelector('a.bo-person-card__link[href^="mailto:"]')?.textContent?.trim() ||
    readLabeledLine(node, 'Email') ||
    '';
  const phoneFromDom =
    fromAttrs.phone.trim() ||
    node.querySelector('a.bo-person-card__link[href^="tel:"]')?.textContent?.trim() ||
    readLabeledLine(node, 'Phone') ||
    '';

  const name = fromAttrs.name.trim() || nameFromDom || emailFromDom || 'Person';
  return {
    ...fromAttrs,
    name,
    role: roleFromDom,
    email: emailFromDom,
    phone: phoneFromDom,
  };
}

/** Stable HTML for note storage (no Quill embed wrapper nodes). */
export function personCardExportOuterHtml(value: QuillPersonCardValue): string {
  const node = document.createElement('span');
  node.className = 'bo-person-card';
  paintPersonCardNode(node, value);
  return node.outerHTML;
}

export function paintPersonCardNode(node: HTMLElement, value: QuillPersonCardValue): void {
  applyPersonCardAttributes(node, value);
  node.classList.add('bo-person-card');
  node.innerHTML = personCardInnerHtml(value);
}
