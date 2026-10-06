export function sanitizeHtml(input: string): string {
  const html = String(input || '');
  if (!html.trim()) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const blockedTags = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'meta', 'link'];
  for (const tag of blockedTags) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  doc.querySelectorAll('*').forEach((el) => {
    const attrs = [...el.attributes];
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '').trim();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (name === 'src' && /^data:/i.test(value) && !/^data:image\//i.test(value)) {
        el.removeAttribute(attr.name);
        continue;
      }
    }

    if (el.tagName.toLowerCase() === 'a') {
      const href = el.getAttribute('href');
      if (!href || !/^(https?:|mailto:|tel:|\/|#)/i.test(href)) {
        el.removeAttribute('href');
      } else {
        el.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  return doc.body.innerHTML;
}
