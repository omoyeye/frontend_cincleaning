/**
 * Prints a DOM subtree in isolation (same styles as the app) so the browser
 * print dialog targets only the invoice, not the full dashboard/modal chrome.
 */
export function printInvoiceElement(root: HTMLElement, onAfterPrint?: () => void): void {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print').forEach((el) => el.remove());

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('title', 'Invoice print');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: 'none',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  const headHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML)
    .join('');

  const baseTag = `<base href="${window.location.origin}/" />`;

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${baseTag}${headHtml}
<style>
  @page { margin: 12mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body class="bg-white text-slate-900">${clone.outerHTML}</body></html>`);
  doc.close();

  const removeIframe = () => {
    if (iframe.isConnected) iframe.remove();
  };

  const fallbackRemove = window.setTimeout(() => {
    removeIframe();
  }, 60000);

  win.addEventListener(
    'afterprint',
    () => {
      window.clearTimeout(fallbackRemove);
      removeIframe();
      onAfterPrint?.();
    },
    { once: true }
  );

  const runPrint = () => {
    win.focus();
    win.print();
  };

  // Let stylesheets from the cloned <link> tags paint before printing
  window.setTimeout(runPrint, 300);
}
