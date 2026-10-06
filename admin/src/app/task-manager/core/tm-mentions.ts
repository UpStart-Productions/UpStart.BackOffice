import { resolveAssetUrl } from '../../core/asset-url.util';
import { avatarPalette, initials } from './tm-format.util';
import { Person } from './tm.types';

type MentionItem = { id: string; value: string; email?: string; avatarUrl?: string; mentionType?: string; [k: string]: string | undefined };

function highlight(container: HTMLElement, text: string, term: string) {
  const t = term.trim().toLowerCase();
  const i = t ? text.toLowerCase().indexOf(t) : -1;
  if (i < 0) {
    container.append(text);
    return;
  }
  container.append(text.slice(0, i));
  const strong = document.createElement('strong');
  strong.className = 'mention-suggest-item__match';
  strong.textContent = text.slice(i, i + t.length);
  container.append(strong, text.slice(i + t.length));
}

function renderItem(item: MentionItem, term: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'mention-suggest-item';
  const avatar = document.createElement('div');
  avatar.className = 'mention-suggest-item__avatar';
  const photo = resolveAssetUrl(item.avatarUrl ?? null);
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    const pal = avatarPalette(item.id);
    avatar.style.background = pal.bg;
    avatar.style.color = pal.fg;
    avatar.textContent = initials({ firstName: null, lastName: null, name: item.value, email: item.email ?? '' });
  }
  const name = document.createElement('span');
  name.className = 'mention-suggest-item__name';
  highlight(name, item.value, term);
  row.append(avatar, name);
  if (item.email) {
    const email = document.createElement('span');
    email.className = 'mention-suggest-item__email';
    highlight(email, item.email, term);
    row.appendChild(email);
  }
  return row;
}

/**
 * Quill `modules` with @mention support (quill-mention), ported from KC.SPP.WebApp.
 * `people` resolves the mentionable people for the current project.
 */
export function mentionQuillModules(people: () => Promise<Person[]>, options: { toolbar?: boolean } = {}) {
  return {
    toolbar: options.toolbar === false
      ? false
      : [['bold', 'italic', 'underline', 'strike'], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'code-block', 'lucideIcon'], ['clean']],
    mention: {
      positioningStrategy: 'fixed',
      allowedChars: /^[A-Za-z\sÀ-ÿ.'-]*$/,
      mentionDenotationChars: ['@'],
      mentionContainerClass: 'mention-suggest-container',
      mentionListClass: 'mention-suggest-list',
      listItemClass: 'mention-suggest-list-item',
      dataAttributes: ['id', 'value', 'denotationChar', 'mentionType'],
      showDenotationChar: true,
      source: async (term: string, renderList: (items: MentionItem[], term: string) => void) => {
        try {
          const list = await people();
          const q = term.trim().toLowerCase();
          const matches = list
            .filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q))
            .slice(0, 12)
            .map((p) => ({ id: p.id, value: p.name, email: p.email, avatarUrl: p.avatarUrl ?? undefined, mentionType: 'user' }));
          renderList(matches, term);
        } catch {
          renderList([], term);
        }
      },
      renderItem: (item: MentionItem, term: string) => renderItem(item, term),
    },
  };
}

/** True when Quill HTML has no visible content. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  if (/<img\b|class="mention"/i.test(html)) return false;
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}
