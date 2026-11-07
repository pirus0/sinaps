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

export const datedName = (kind, extension) => `dallanan-not-${kind}-${new Date().toISOString().slice(0, 10)}.${extension}`;
