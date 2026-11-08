import { el, button, icon } from './ui.js';

/** Inline header search shared by home and canvas; owns only its temporary DOM. */
export class HeaderSearch {
  constructor({ header, query = '', results, select, close, change, prefix }) {
    this.header = header;
    this.original = [...header.childNodes];
    this.app = header.closest('#app');
    this.app.classList.add('search-active');
    this.inert = [...this.app.querySelectorAll('#board,#content,#toolbar')].map(node => [node, node.inert, node.getAttribute('aria-hidden')]);
    for (const [node] of this.inert) { node.inert = true; node.setAttribute('aria-hidden', 'true'); }
    this.scrim = el('div', 'search-scrim');
    this.scrim.addEventListener('click', close);
    this.results = el('div', 'header-search-results');
    this.results.setAttribute('aria-label', 'Sonuçlar');
    this.results.setAttribute('role', 'region');
    this.input = el('input', 'header-search-input');
    this.input.type = 'search';
    this.input.placeholder = 'Ara';
    this.input.setAttribute('aria-label', 'Ara');
    this.input.autocomplete = 'off';
    this.input.value = query;
    const bar = el('div', 'header-search-bar');
    bar.append(icon('search'), this.input, button('Kapat', close, 'icon-button', 'close'));
    prefix.classList.add('header-search-prefix');
    header.replaceChildren(prefix, bar);
    document.body.append(this.scrim, this.results);
    const draw = () => {
      change?.(this.input.value);
      this.results.replaceChildren();
      const entries = results(this.input.value);
      for (const entry of entries) {
        const result = button(entry.label, () => select(entry), 'search-result-card');
        if (entry.glyph) result.classList.add('global-board');
        const label = el('span');
        if (entry.glyph) label.append(icon(entry.glyph));
        label.append(document.createTextNode(entry.label));
        result.replaceChildren(label, el('small', '', entry.detail));
        this.results.append(result);
      }
      if (this.input.value.trim() && !entries.length) this.results.append(el('p', 'sheet-copy', 'Boş'));
      this.results.hidden = !this.input.value.trim();
    };
    this.input.addEventListener('input', draw);
    this.input.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    this.resize = () => {
      const height = window.visualViewport?.height || innerHeight;
      this.results.style.maxHeight = Math.max(80, height - 128) + 'px';
    };
    window.visualViewport?.addEventListener('resize', this.resize);
    window.addEventListener('resize', this.resize);
    this.resize(); draw(); this.input.focus({ preventScroll: true });
  }
  destroy() {
    this.app.classList.remove('search-active');
    for (const [node, previous, hidden] of this.inert) { node.inert = previous; if (hidden === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', hidden); }
    this.scrim.remove(); this.results.remove();
    this.header.replaceChildren(...this.original);
    window.visualViewport?.removeEventListener('resize', this.resize);
    window.removeEventListener('resize', this.resize);
  }
}
