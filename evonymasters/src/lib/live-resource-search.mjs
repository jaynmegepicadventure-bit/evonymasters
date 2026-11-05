// Progressive enhancement: Google Sheets-backed search with existing JSON results as fallback.
// Only user queries are sent. Never fetch the private spreadsheet or a bulk dataset.
const ENDPOINT = 'https://evonymasters-sheet-sync.jaynmegepicadventure.workers.dev/v1/search';
function typeMatches(row, selected) {
  if (!selected) return true;
  if (selected === 'Event Activity') return row.source === 'event';
  return row.source === 'monster' && String(row.monsterType || '').toLowerCase() === selected.toLowerCase();
}
function cell(tag, value, css) {
  const el = document.createElement(tag);
  if (css) el.className = css;
  el.textContent = String(value ?? '');
  return el;
}
function makeTable(rows) {
  const table = document.createElement('table');
  table.className = 'results-table';
  const thead = document.createElement('thead');
  const head = document.createElement('tr');
  for (const title of ['Type', 'Source', 'Resource', 'Quantity', 'Drop', 'Obtained through']) head.append(cell('th', title));
  thead.append(head);table.append(thead);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.append(cell('td', r.source === 'event' ? 'Event' : 'Monster'));
    const name = cell('td', [r.name, r.level ? 'Lv '+r.level : ''].filter(Boolean).join(' '));
    tr.append(name);
    tr.append(cell('td', r.item));
    tr.append(cell('td', r.quantity || 'Variable', 'qty'));
    tr.append(cell('td', r.classification || 'Unspecified'));
    tr.append(cell('td', Array.isArray(r.route) ? r.route.join(' → ') : 'Direct'));
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}
export function installLiveResourceSearch({query, type, results, count, empty, emptyText}) {
  let requestSerial = 0;
  let timer;
  const render = () => {
    clearTimeout(timer);
    const serial = ++requestSerial;
    const term = query.value.trim();
    if (term.length < 3) return; // local fallback
    timer = setTimeout(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5500);
      try {
        const selection = type.value;
        const source = selection === 'Event Activity' ? 'event' : selection ? 'monster' : '';
        const monsterType = selection === 'Event Activity' ? '' : selection;
        const url = ENDPOINT + '?q=' + encodeURIComponent(term) +
          (source ? '&source=' + encodeURIComponent(source) : '') +
          (monsterType ? '&monsterType=' + encodeURIComponent(monsterType) : '');
        const response = await fetch(url, {signal:controller.signal, mode:'cors'});
        if (!response.ok) throw new Error('Live search unavailable');
        const payload = await response.json();
        if (serial !== requestSerial || query.value.trim() !== term) return;
        if (!Array.isArray(payload.results)) throw new Error('Invalid live search response');
        const selected = payload.results.filter(r => typeMatches(r, type.value));
        results.replaceChildren();
        if (selected.length) results.append(makeTable(selected));
        count.textContent = selected.length + ' live result' + (selected.length === 1 ? '' : 's');
        empty.hidden = selected.length > 0;
        if (!selected.length) emptyText.textContent = 'No matching rewards in the current spreadsheet.';
      } catch {
        // Keep the original local JSON results; no UI disruption.
      } finally { clearTimeout(timeout); }
    }, 260);
  };
  query.addEventListener('input', render);
  type.addEventListener('change', render);
  render();
}
