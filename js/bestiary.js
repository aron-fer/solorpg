// Bestiary: any Kartei entry whose notes contain a statblock
// ("Name: #E 1d6 | … | HD 1+2 | …") counts as a monster. The text before the
// statblock (and the parent entry's text, for variants) is its description.
// Monsters can be put into the Kampf tab by search, or straight from a
// rolled table result that names them ("2d6 ape-men" → ⚔ Ape-Man).

const bestiaryCache = new WeakMap();
const SB_START = /(^|\n)[^\n]*?:?\s*#E\s/;   // colon is missing in a few book entries

// Plural forms so "2d6 ape-men" or "1d4 gargoyles" find their monster;
// "Donkey/Mule/Pony" also answers to each part, "Worm of Ymir" to "worms of Ymir".
function pluralWord(w){
  if(/man$/.test(w)) return w.replace(/man$/,'men');
  if(/(mouse|louse)$/.test(w)) return w.replace(/ouse$/,'ice');
  if(/^ox$|[ -]ox$/.test(w)) return w+'en';
  if(/[^aeiou]y$/.test(w)) return w.slice(0,-1)+'ies';
  if(/(s|x|z|ch|sh)$/.test(w)) return w+'es';
  if(/fe$/.test(w)) return w.slice(0,-2)+'ves';
  if(/[^f]f$/.test(w)) return w.slice(0,-1)+'ves';
  return w+'s';
}
function bestiaryNameForms(name){
  const base = String(name).replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
  if(!base) return [];
  const forms = new Set();
  const parts = base.includes('/') ? [base, ...base.split('/').map(x=>x.trim()).filter(Boolean)] : [base];
  // "Class III Earth Elemental" → also "earth elemental"; "Adult Tree-Man" → also "tree-man".
  const cls = base.match(/^class [ivxlc]+ (.+)$/);
  if(cls) parts.push(cls[1]);
  const hyph = base.match(/ ([\w’'æœ]+-[\w’'æœ-]+)$/u);
  if(hyph && hyph[1].length>=5) parts.push(hyph[1]);
  parts.forEach(n=>{
    forms.add(n);
    const of = n.match(/^(.*?)([\w’'æœ-]+)( of .+)$/u);
    const m = of || n.match(/^(.*?)([\w’'æœ-]+)()$/u);
    if(m){ forms.add(m[1]+pluralWord(m[2])+m[3]); forms.add(m[1]+m[2]+'s'+m[3]); }
  });
  return [...forms];
}
function bestiaryIndex(){
  const active = getActive();
  // Keyed by the karteien array: it only changes when a Kartei does.
  let idx = bestiaryCache.get(active.karteien);
  if(idx) return idx;
  const items = [];
  active.karteien.forEach(k=>{
    const byId = new Map(k.entries.map(e=>[e.id, e]));
    k.entries.forEach(e=>{
      const notes = e.notes || '';
      const m = notes.match(SB_START);
      if(!m || !/\bHD\s/.test(notes)) return;
      const at = m.index + m[1].length;
      const parent = e.parentId ? byId.get(e.parentId) : null;
      const own = notes.slice(0, at).trim();
      const desc = [parent && !SB_START.test(parent.notes||'') ? (parent.notes||'').trim() : '', own].filter(Boolean).join('\n\n');
      items.push({key:`${k.id}:${e.id}`, group: parent ? `${k.id}:${parent.id}` : '', name:e.title || 'Monster', parentTitle: parent ? parent.title : '', statText: notes.slice(at), desc});
    });
  });
  // One regex over all name forms, longest first, for table results.
  const formMap = new Map();
  items.forEach(it=>bestiaryNameForms(it.name).forEach(f=>{ if(f.length>=3 && !formMap.has(f)) formMap.set(f, it); }));
  const forms = [...formMap.keys()].sort((a,b)=>b.length-a.length);
  const esc = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re = forms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${forms.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  idx = {items, byKey:new Map(items.map(it=>[it.key, it])), formMap, re};
  bestiaryCache.set(active.karteien, idx);
  return idx;
}
// Monsters named in a text, with the dice/number written right before them.
function bestiaryMatches(text){
  const idx = bestiaryIndex();
  if(!idx.re || !text) return [];
  const out = [], seen = new Set();
  idx.re.lastIndex = 0;
  let m;
  while((m = idx.re.exec(text)) && out.length<4){
    const it = idx.formMap.get(m[1].toLowerCase());
    if(!it || seen.has(it.key)) continue;
    seen.add(it.key);
    const before = text.slice(Math.max(0, m.index-14), m.index);
    const dice = (before.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*(?:[×x]\s*)?$/i)||[])[1] || '';
    out.push({item:it, dice});
  }
  return out;
}
function bestiaryButtonsFor(text){
  return bestiaryMatches(text).map(({item, dice})=>
    `<button class="bestiary-btn" onclick="openBestiaryPick(${jsStr(item.key)}, ${jsStr(dice)})" title="In den Kampf">⚔ ${escapeHtml(item.name)}</button>`).join('');
}

// ---- Kampf tab picker ----
function toggleBestiaryPanel(){
  ui.bestiaryOpen = !ui.bestiaryOpen;
  if(!ui.bestiaryOpen){ ui.bestiaryPick = null; ui.bestiaryDice = ''; }
  render();
}
function openBestiaryPick(key, dice){
  ui.bestiaryOpen = true; ui.bestiaryPick = key; ui.bestiaryDice = dice || ''; ui.bestiaryCount = '';
  if(ui.activeTab!=='battle' && typeof setActiveTab==='function') setActiveTab('battle'); else render();
  setTimeout(()=>{ const el = document.getElementById('bestiary-panel'); if(el) el.scrollIntoView({block:'center', behavior:'smooth'}); }, 0);
}
function onBestiaryQuery(el){
  ui.bestiaryQuery = el.value;
  const box = document.getElementById('bestiary-results');
  if(box) box.innerHTML = renderBestiaryResults();
}
function pickBestiary(key){ ui.bestiaryPick = key; ui.bestiaryDice = ''; ui.bestiaryCount = ''; render(); }
// Switch between variants (Class I/II/III …) and keep the table's dice hint.
function pickBestiaryVariant(key){ ui.bestiaryPick = key; render(); }
function onBestiaryCount(el){ ui.bestiaryCount = el.value; }
function renderBestiaryResults(){
  const q = (ui.bestiaryQuery||'').trim().toLowerCase();
  const items = bestiaryIndex().items;
  const hits = (q ? items.filter(it=>(it.name+' '+it.parentTitle).toLowerCase().includes(q)) : items).slice(0, 30);
  if(!items.length) return `<p class="small-muted" style="margin:0;">Noch kein Bestiarium. Importiere eine Kartei mit Statblocks (z.B. hyperborea-bestiary.json) oder schreibe Statblocks in die Notizen einer Kartei-Karte.</p>`;
  if(!hits.length) return `<p class="small-muted" style="margin:0;">Nichts gefunden.</p>`;
  return hits.map(it=>{
    const p = parseEnemyStatblock(it.statText);
    const stat = ['HD','AC','#E'].map(k=>{ const v = sbStatOf(p.stats,k); return v ? `${k} ${escapeHtml(v)}` : ''; }).filter(Boolean).join(' · ');
    return `<button class="table-row row between" style="text-align:left;color:var(--text);" onclick="pickBestiary(${jsStr(it.key)})">
      <span>${escapeHtml(it.name)}${it.parentTitle?` <span class="small-muted">(${escapeHtml(it.parentTitle)})</span>`:''}</span>
      <span class="small-muted" style="font-family:ui-monospace,monospace;font-size:11px;">${stat}</span></button>`;
  }).join('');
}
function addEnemyFromBestiary(){
  const it = bestiaryIndex().byKey.get(ui.bestiaryPick);
  if(!it) return;
  const p = parseEnemyStatblock(it.statText);
  const count = Math.max(1, parseInt(ui.bestiaryCount,10)||1);
  const sb = {id:uid(), kind:'enemy', charId:null, name:it.name, notes:'', desc:it.desc, stats:p.stats, specials:p.specials, members:makeMembers(sbStatOf(p.stats,'HD'), count), statuses:[]};
  updateActive(camp=>({...camp, statblocks:[...camp.statblocks, sb]}));
  pushLog(enemyHdMode() ? `${sb.name}: ${count}×, HD ${sbStatOf(p.stats,'HD')||'?'}` : `${sb.name}: ${count}×, HP ${sb.members.map(m=>m.max).join(', ')}`, 'battle');
  ui.bestiaryPick = null; ui.bestiaryDice = ''; ui.bestiaryCount = '';
  saveState(); render();
}
function renderBestiaryPanel(){
  const it = ui.bestiaryPick ? bestiaryIndex().byKey.get(ui.bestiaryPick) : null;
  if(it){
    const p = parseEnemyStatblock(it.statText);
    const e = sbStatOf(p.stats,'#E');
    const variants = it.group ? bestiaryIndex().items.filter(x=>x.group===it.group) : [];
    const hint = ui.bestiaryDice ? `${ui.bestiaryDice} laut Tabelle` : (e ? `#E ${e}` : '');
    return `<div class="panel" id="bestiary-panel" style="gap:8px;">
      <div class="row between"><span class="sb-name" style="font-size:17px;">${escapeHtml(it.name)}</span>
        <button class="icon-btn" onclick="pickBestiary(null)" title="Zurück zur Suche">←</button></div>
      <div class="sb-line battle-stats" style="border-top:none;">${p.stats.map(s=>`<span class="sb-item${s.v.length>14?' sb-wrap':''}"><span class="sb-lbl">${escapeHtml(s.k)}</span> ${escapeHtml(s.v)}</span>`).join('<span class="sb-sep"> · </span>')}</div>
      ${variants.length>1 ? `<div class="row wrap" style="gap:6px;">${variants.map(v=>`<button class="btn ${v.key===it.key?'btn-gold':'btn-raised'}" style="padding:2px 8px;font-size:12px;" onclick="pickBestiaryVariant(${jsStr(v.key)})">${escapeHtml(v.name.replace(/\s*\([^)]*\)/g,''))}</button>`).join('')}</div>` : ''}
      ${it.desc ? `<details><summary class="small-muted" style="cursor:pointer;">Beschreibung</summary><div class="battle-desc">${escapeHtml(it.desc)}</div></details>` : ''}
      <div class="row" style="gap:8px;">
        <input type="number" min="1" value="${escapeHtml(ui.bestiaryCount||'')}" oninput="onBestiaryCount(this)" placeholder="Anzahl${hint?` (${escapeHtml(hint)})`:''}" style="flex:1;" onkeydown="if(event.key==='Enter'){onBestiaryCount(this);addEnemyFromBestiary();}">
        <button class="btn btn-gold" onclick="addEnemyFromBestiary()">In den Kampf</button>
      </div>
    </div>`;
  }
  return `<div class="panel" id="bestiary-panel" style="gap:8px;">
    <input type="text" value="${escapeHtml(ui.bestiaryQuery||'')}" placeholder="Monster suchen…" oninput="onBestiaryQuery(this)">
    <div id="bestiary-results" style="display:flex;flex-direction:column;gap:4px;max-height:320px;overflow-y:auto;">${renderBestiaryResults()}</div>
  </div>`;
}
