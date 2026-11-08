export async function shareFile(content, name, type, shareTitle = 'Dallanan Not') {
  const file = new File([content], name, { type });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: shareTitle }); return true; }
    catch (error) { if (error.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

export const datedName = (kind, extension) => `sinaps-${kind}-${new Date().toISOString().slice(0, 10)}.${extension}`;

export function downloadFile(file) {
  const url = URL.createObjectURL(file), anchor = document.createElement('a');
  anchor.href = url; anchor.download = file.name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** The ready File is handed to share before any asynchronous rendering. */
export async function sharePrepared(file, title = 'Sinaps', text) {
  let supported = false;
  try { supported = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); } catch {}
  if (supported) {
    try { await navigator.share({ files: [file], title, ...(text ? { text } : {}) }); return 'shared'; }
    catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      if (error.name === 'NotAllowedError') return 'activation';
    }
  }
  downloadFile(file); return 'downloaded';
}
