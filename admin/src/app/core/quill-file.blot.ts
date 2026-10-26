export type ContentFileBlotValue = {
  url: string;
  name: string;
};

export function registerContentFileBlot(Quill: typeof import('quill').default): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const Embed = Quill.import('blots/embed') as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  class ContentFileBlot extends Embed {
    static blotName = 'contentFile';
    static tagName = 'span';
    static className = 'ql-content-file';

    static create(value: ContentFileBlotValue | string) {
      const node = super.create(value) as HTMLElement;
      const parsed =
        typeof value === 'string'
          ? { url: value, name: 'File' }
          : { url: value.url, name: value.name };
      node.setAttribute('data-url', parsed.url);
      node.setAttribute('data-name', parsed.name);

      const link = document.createElement('a');
      link.href = parsed.url;
      link.textContent = parsed.name;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      node.replaceChildren(link);
      return node;
    }

    static value(domNode: HTMLElement): ContentFileBlotValue {
      const anchor = domNode.querySelector('a');
      return {
        url: domNode.getAttribute('data-url') ?? anchor?.getAttribute('href') ?? '',
        name: domNode.getAttribute('data-name') ?? anchor?.textContent?.trim() ?? 'File',
      };
    }
  }

  Quill.register('formats/contentFile', ContentFileBlot, true);
}
