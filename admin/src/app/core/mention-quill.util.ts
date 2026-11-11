import { resolveAssetUrl } from './asset-url.util';
import { avatarPalette, initials } from '../task-manager/core/tm-format.util';

export type MentionQuillItem = {
  id: string;
  value: string;
  mentionType?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  organizationName?: string;
  projectId?: string;
  projectName?: string;
  clientName?: string;
};

function appendHighlightedText(container: HTMLElement, text: string, searchTerm: string): void {
  const term = searchTerm.trim().toLowerCase();
  const lower = text.toLowerCase();
  if (!term || !lower.includes(term)) {
    container.append(text);
    return;
  }
  const start = lower.indexOf(term);
  if (start > 0) container.append(text.slice(0, start));
  const match = document.createElement('strong');
  match.className = 'mention-suggest-item__match';
  match.textContent = text.slice(start, start + term.length);
  container.append(match);
  if (start + term.length < text.length) container.append(text.slice(start + term.length));
}

function renderUserItem(item: MentionQuillItem, searchTerm: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mention-suggest-item';
  const avatar = document.createElement('div');
  avatar.className = 'mention-suggest-item__avatar ubo-avatar ubo-avatar--med';
  const photo = resolveAssetUrl(item.avatarUrl?.trim() || null);
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    const pal = avatarPalette(item.id);
    avatar.style.background = pal.bg;
    avatar.style.color = pal.fg;
    avatar.textContent = initials({
      firstName: item.firstName ?? null,
      lastName: item.lastName ?? null,
      name: item.value,
      email: item.email ?? '',
    });
  }
  const name = document.createElement('span');
  name.className = 'mention-suggest-item__name';
  appendHighlightedText(name, item.value, searchTerm);
  row.append(avatar, name);
  if (item.email?.trim()) {
    const email = document.createElement('span');
    email.className = 'mention-suggest-item__email';
    appendHighlightedText(email, item.email.trim(), searchTerm);
    row.appendChild(email);
  }
  return row;
}

function renderRecordItem(
  item: MentionQuillItem,
  searchTerm: string,
  extraClass: string,
  iconClass: string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = `mention-suggest-item mention-suggest-item--record ${extraClass}`;
  const icon = document.createElement('span');
  icon.className = `mention-suggest-item__record-icon pi ${iconClass}`;
  icon.setAttribute('aria-hidden', 'true');
  const title = document.createElement('span');
  title.className = 'mention-suggest-item__name';
  appendHighlightedText(title, item.value.trim(), searchTerm);
  row.append(icon, title);
  const sub = item.projectName?.trim() || item.clientName?.trim() || item.organizationName?.trim();
  if (sub) {
    const line = document.createElement('span');
    line.className = 'mention-suggest-item__email';
    appendHighlightedText(line, sub, searchTerm);
    row.appendChild(line);
  }
  return row;
}

export type MentionCandidateKind = 'user' | 'contact' | 'task' | 'project' | 'invoice' | 'crmProject';

export type ClusterMentionOptions = {
  activity?: boolean;
};

function mentionLabelRank(label: string, q: string): number {
  const term = q.trim().toLowerCase();
  if (!term) return 0;
  const idx = label.toLowerCase().indexOf(term);
  return idx === -1 ? 1000 : idx;
}

/** Cluster @mention results by kind (activity order vs default). */
export function clusterMentionCandidates<T extends { kind: MentionCandidateKind; label: string }>(
  candidates: T[],
  q = '',
  options: ClusterMentionOptions = {},
): T[] {
  const people: T[] = [];
  const invoices: T[] = [];
  const tasks: T[] = [];
  const projects: T[] = [];
  for (const c of candidates) {
    if (c.kind === 'user' || c.kind === 'contact') people.push(c);
    else if (c.kind === 'invoice') invoices.push(c);
    else if (c.kind === 'task') tasks.push(c);
    else if (c.kind === 'project' || c.kind === 'crmProject') projects.push(c);
  }
  const sortBucket = (arr: T[]) =>
    [...arr].sort(
      (a, b) => mentionLabelRank(a.label, q) - mentionLabelRank(b.label, q) || a.label.localeCompare(b.label),
    );
  if (options.activity) {
    return [...sortBucket(people), ...sortBucket(invoices), ...sortBucket(projects), ...sortBucket(tasks)];
  }
  return [...sortBucket(people), ...sortBucket(tasks), ...sortBucket(projects)];
}

export type MentionPopoverModuleRef = {
  mentionContainer: HTMLElement;
  hideMentionList: () => void;
};

const mentionWheelGuards = new WeakMap<HTMLElement, (e: WheelEvent) => void>();
const mentionOutsideCloseGuards = new WeakMap<HTMLElement, (e: MouseEvent) => void>();

/** Keep wheel/trackpad scroll inside the @mention popover (no page scroll-through). */
export function bindMentionPopoverScrollGuard(el: HTMLElement): void {
  if (mentionWheelGuards.has(el)) return;

  const onWheel = (e: WheelEvent) => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflow = scrollHeight > clientHeight + 1;
    if (!overflow) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const atTop = scrollTop <= 0;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
    if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
      e.preventDefault();
    }
    e.stopPropagation();
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  mentionWheelGuards.set(el, onWheel);
}

export function unbindMentionPopoverScrollGuard(el: HTMLElement): void {
  const onWheel = mentionWheelGuards.get(el);
  if (!onWheel) return;
  el.removeEventListener('wheel', onWheel);
  mentionWheelGuards.delete(el);
}

/** Close the @mention list when the user clicks outside the popover. */
export function bindMentionPopoverOutsideClose(ref: MentionPopoverModuleRef): void {
  const { mentionContainer, hideMentionList } = ref;
  if (mentionOutsideCloseGuards.has(mentionContainer)) return;

  const onPointerDown = (e: MouseEvent) => {
    const target = e.target;
    if (target instanceof Node && mentionContainer.contains(target)) return;
    hideMentionList();
  };

  document.addEventListener('mousedown', onPointerDown, true);
  mentionOutsideCloseGuards.set(mentionContainer, onPointerDown);
}

export function unbindMentionPopoverOutsideClose(el: HTMLElement): void {
  const onPointerDown = mentionOutsideCloseGuards.get(el);
  if (!onPointerDown) return;
  document.removeEventListener('mousedown', onPointerDown, true);
  mentionOutsideCloseGuards.delete(el);
}

export function renderMentionDropdownItem(item: MentionQuillItem, searchTerm: string): HTMLElement {
  const type = item.mentionType ?? 'user';
  if (type === 'contact') return renderUserItem(item, searchTerm);
  if (type === 'task') return renderRecordItem(item, searchTerm, 'mention-suggest-item--task', 'pi-check-square');
  if (type === 'project' || type === 'crmProject')
    return renderRecordItem(item, searchTerm, 'mention-suggest-item--project', 'pi-folder');
  if (type === 'client') return renderRecordItem(item, searchTerm, 'mention-suggest-item--client', 'pi-building');
  if (type === 'invoice') return renderRecordItem(item, searchTerm, 'mention-suggest-item--invoice', 'pi-file');
  return renderUserItem(item, searchTerm);
}
