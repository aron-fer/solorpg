// [[Links]] between Kartei entries / journal, and the link picker.
// ---- Links ([[Name]] / [[<karteiname>:Name]] / [[text:Name]]) ----
// Lowercased title -> first matching entry, per Kartei and for the journal.
// Cached per normalized campaign object, so it's rebuilt only after changes.
const linkIndexCache = new WeakMap();
function getLinkIndex(active){
  let idx = linkIndexCache.get(active);
  if(idx) return idx;
  const byTitle = (items, titleOf) => {
    const m = new Map();
    items.forEach(it=>{ const k = (titleOf(it)||'').trim().toLowerCase(); if(k && !m.has(k)) m.set(k, it); });
    return m;
  };
  idx = {
    kartei: new Map(active.karteien.map(k=>[k.id, byTitle(k.entries, e=>e.title)])),
    journal: byTitle(active.journal, j=>j.title),
  };
  linkIndexCache.set(active, idx);
  return idx;
}
function resolveLink(raw){
  const active = getActive();
  let category = null;
  let query = raw;
  const catMatch = raw.match(/^([^:]+):(.+)$/);
  if(catMatch){ category = catMatch[1].trim().toLowerCase(); query = catMatch[2]; }
  const q = query.trim().toLowerCase();
  if(!q) return null;

  const index = getLinkIndex(active);
  const tryKartei = (k) => index.kartei.get(k.id).get(q);
  const tryJournal = () => index.journal.get(q);

  if(category){
    if(category==='text'){ const r=tryJournal(); return r?{type:'text', item:r}:null; }
    const kartei = active.karteien.find(k=>k.name.trim().toLowerCase()===category);
    if(kartei){ const r=tryKartei(kartei); return r?{type:'kartei', karteiId:kartei.id, item:r}:null; }
    return null;
  }
  for(const k of active.karteien){
    const r = tryKartei(k);
    if(r) return {type:'kartei', karteiId:k.id, item:r};
  }
  const j = tryJournal(); if(j) return {type:'text', item:j};
  return null;
}
function renderLinkedText(raw){
  if(!raw) return '';
  const escaped = escapeHtml(raw);
  return escaped.replace(/\[\[([^\]]+)\]\]/g, (whole, inner) => {
    const resolved = resolveLink(inner);
    if(!resolved) return whole;
    const label = inner.includes(':') ? inner.split(':').slice(1).join(':') : inner;
    const args = resolved.type==='kartei' ? `'kartei','${resolved.item.id}','${resolved.karteiId}'` : `'${resolved.type}','${resolved.item.id}'`;
    return `<button class="link-chip" onclick="navigateToLink(${args})">${label}</button>`;
  });
}
function navigateToLink(type, id, karteiId){
  if(type==='kartei'){ ui.activeTab = karteiId; startEditKarteiEntry(karteiId, id); return; }
  if(type==='text'){
    updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===id?{...j, collapsed:false}:j)}));
    ui.activeTab='notes'; saveState(); render();
    setTimeout(()=>{ const el=document.getElementById('journal-'+id); if(el) el.scrollIntoView({behavior:'smooth', block:'center'}); }, 50);
    return;
  }
}

// ---- Link picker (helper to insert [[Name]] without typing brackets) ----
function linkPickerTextareaId(context){
  if(context.type==='kartei') return 'kartei-entry-notes-textarea';
  if(context.type==='journal') return `journal-content-textarea-${context.entryId}`;
}
function getLinkContextValue(context){
  if(context.type==='kartei') return ui.karteiEntryDraft.notes;
  if(context.type==='journal'){
    const j = getActive().journal.find(j=>j.id===context.entryId);
    return j ? j.value : '';
  }
  return '';
}
function setLinkContextValue(context, value){
  if(context.type==='kartei'){ ui.karteiEntryDraft.notes = value; return; }
  if(context.type==='journal'){
    updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===context.entryId?{...j, value}:j)}));
    saveState();
    return;
  }
}
function openLinkPicker(type, entryId){
  const context = entryId ? {type, entryId} : {type};
  const el = document.getElementById(linkPickerTextareaId(context));
  const cursorPos = el ? el.selectionStart : (getLinkContextValue(context)||'').length;
  const active = getActive();
  const candidates = [];
  active.karteien.forEach(k=>{ k.entries.forEach(e=>candidates.push({group:k.name, name:e.title})); });
  active.journal.filter(j=>j.title).forEach(j=>candidates.push({group:'Journal', name:j.title}));
  ui.linkPickerCandidates = candidates;
  ui.linkPicker = {context, cursorPos, query:''};
  render();
  setTimeout(()=>{ const s = document.getElementById('link-picker-search'); if(s) s.focus(); }, 0);
}
function closeLinkPicker(){ ui.linkPicker=null; render(); }
function insertLinkAndClose(idx){
  const candidate = ui.linkPickerCandidates[idx];
  if(!candidate){ closeLinkPicker(); return; }
  const {context, cursorPos} = ui.linkPicker;
  const current = getLinkContextValue(context) || '';
  const insertion = `[[${candidate.name}]]`;
  const pos = Math.max(0, Math.min(cursorPos, current.length));
  const newValue = current.slice(0,pos) + insertion + current.slice(pos);
  setLinkContextValue(context, newValue);
  ui.linkPicker = null;
  render();
  setTimeout(()=>{
    const el = document.getElementById(linkPickerTextareaId(context));
    if(el){ el.focus(); const newPos = pos + insertion.length; el.setSelectionRange(newPos,newPos); }
  }, 0);
}
function filterLinkCandidates(query){
  const q = query.trim().toLowerCase();
  const withIdx = ui.linkPickerCandidates.map((c,idx)=>({group:c.group, name:c.name, idx}));
  if(!q) return withIdx;
  return withIdx.filter(c=>c.name.toLowerCase().includes(q));
}
function renderLinkPickerResultsHTML(list){
  const groups = {};
  list.forEach(c=>{ if(!groups[c.group]) groups[c.group]=[]; groups[c.group].push(c); });
  const groupKeys = Object.keys(groups);
  if(!groupKeys.length) return `<p class="small-muted">Keine Treffer.</p>`;
  return groupKeys.map(g=>`
    <div style="display:flex;flex-direction:column;gap:4px;">
      <span class="small-muted">${escapeHtml(g)}</span>
      ${groups[g].map(it=>`<button class="row between" style="border-radius:8px;padding:8px 10px;background:var(--panel-raised);border:1px solid var(--border);color:var(--text);" onclick="insertLinkAndClose(${it.idx})"><span>${escapeHtml(it.name)}</span></button>`).join('')}
    </div>`).join('');
}
function onLinkPickerSearch(el){
  ui.linkPicker.query = el.value;
  const container = document.getElementById('link-picker-results');
  if(container) container.innerHTML = renderLinkPickerResultsHTML(filterLinkCandidates(el.value));
}
function onLinkPickerSearchKeydown(e){
  if(e.key==='Enter'){
    const filtered = filterLinkCandidates(ui.linkPicker.query||'');
    if(filtered.length) insertLinkAndClose(filtered[0].idx);
  }
}
function renderLinkPickerModal(){
  const initialResults = renderLinkPickerResultsHTML(filterLinkCandidates(ui.linkPicker.query||''));
  return `<div class="modal-overlay" style="z-index:60;">
    <div class="modal-sheet">
      <div class="row between"><span class="label" style="color:var(--gold);">Verlinken</span>
        <button class="icon-btn" onclick="closeLinkPicker()">✕</button></div>
      <input id="link-picker-search" type="text" value="${escapeHtml(ui.linkPicker.query||'')}" placeholder="Tippen zum Filtern…" oninput="onLinkPickerSearch(this)" onkeydown="onLinkPickerSearchKeydown(event)">
      <div id="link-picker-results" style="display:flex;flex-direction:column;gap:12px;max-height:320px;overflow-y:auto;">${initialResults}</div>
    </div>
  </div>`;
}
