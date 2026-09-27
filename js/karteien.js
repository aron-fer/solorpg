// Karteien (card indexes): logic + views.
// ---- Karteien (generic NPCs/Orte/Threads/... tab type) ----
function addKartei(){
  const active = getActive();
  const newKartei = {id:uid(), name:`Kartei ${active.karteien.length+1}`, icon:'📇', hasCheckbox:false, entries:[]};
  updateActive(camp=>({...camp, karteien:[...camp.karteien, newKartei], tabOrder:[...camp.tabOrder, newKartei.id]}));
  ui.activeTab = newKartei.id;
  saveState(); render();
}
function startRenameKartei(id){
  ui.editingKarteiId = id;
  ui.karteiNameDraft = getActive().karteien.find(k=>k.id===id).name;
  render();
}
function onKarteiNameDraft(el){ ui.karteiNameDraft = el.value; }
function cancelRenameKartei(){ ui.editingKarteiId=null; render(); }
function saveKarteiName(){
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===ui.editingKarteiId?{...k, name: ui.karteiNameDraft.trim()||'Kartei'}:k)}));
  ui.editingKarteiId=null; saveState(); render();
}
function toggleKarteiCheckboxFeature(id){
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===id?{...k, hasCheckbox:!k.hasCheckbox}:k)}));
  saveState(); render();
}
function deleteKartei(id){
  updateActive(camp=>({...camp, karteien: camp.karteien.filter(k=>k.id!==id), tabOrder: camp.tabOrder.filter(tid=>tid!==id)}));
  if(ui.activeTab===id) ui.activeTab='notes';
  saveState(); render();
}
function onKarteiNameInline(id, el){
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===id?{...k, name:el.value}:k)}));
  saveState();
}
function onKarteiIconInput(id, el){
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===id?{...k, icon: el.value || '📇'}:k)}));
  saveState();
}

function startNewKarteiEntry(karteiId){
  ui.editingKarteiEntry = {karteiId, id:'new'};
  ui.karteiEntryDraft = {title:'', notes:'', resolved:false, parentId:null};
  render();
}
function startEditKarteiEntry(karteiId, entryId){
  const kartei = getActive().karteien.find(k=>k.id===karteiId);
  const e = kartei.entries.find(e=>e.id===entryId);
  ui.editingKarteiEntry = {karteiId, id:entryId};
  ui.karteiEntryDraft = {title:e.title, notes:e.notes, resolved:e.resolved, parentId:e.parentId||null};
  render();
}
function cancelEditKarteiEntry(){ ui.editingKarteiEntry=null; render(); }
function onKarteiEntryTitle(el){ ui.karteiEntryDraft.title = el.value; }
function onKarteiEntryNotes(el){ ui.karteiEntryDraft.notes = el.value; }
function onKarteiEntryParent(el){ ui.karteiEntryDraft.parentId = el.value || null; }
function toggleKarteiEntryDraftResolved(){ ui.karteiEntryDraft.resolved = !ui.karteiEntryDraft.resolved; render(); }
function saveKarteiEntry(){
  const {karteiId, id} = ui.editingKarteiEntry;
  const title = ui.karteiEntryDraft.title.trim() || 'Unbenannt';
  const notes = ui.karteiEntryDraft.notes;
  const resolved = ui.karteiEntryDraft.resolved;
  const parentId = ui.karteiEntryDraft.parentId || null;
  updateActive(camp=>({
    ...camp,
    karteien: camp.karteien.map(k=>{
      if(k.id!==karteiId) return k;
      const entries = [...k.entries];
      if(id==='new'){ entries.unshift({id:uid(), title, notes, resolved, parentId, collapsed:false}); }
      else{ const idx = entries.findIndex(e=>e.id===id); entries[idx] = {...entries[idx], title, notes, resolved, parentId}; }
      return {...k, entries};
    }),
  }));
  ui.editingKarteiEntry=null; saveState(); render();
}
function deleteKarteiEntry(){
  const {karteiId, id} = ui.editingKarteiEntry;
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===karteiId?{...k, entries:k.entries.filter(e=>e.id!==id && e.parentId!==id)}:k)}));
  ui.editingKarteiEntry=null; saveState(); render();
}
function toggleKarteiEntryResolved(karteiId, entryId){
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===karteiId?{...k, entries:k.entries.map(e=>e.id===entryId?{...e,resolved:!e.resolved}:e)}:k)}));
  saveState(); render();
}
function toggleKarteiEntryCollapse(karteiId, entryId){
  updateActive(camp=>({...camp, karteien: camp.karteien.map(k=>k.id===karteiId?{...k, entries:k.entries.map(e=>e.id===entryId?{...e, collapsed:!e.collapsed}:e)}:k)}));
  saveState(); render();
}

function renderKarteiEntryCard(kartei, e){
  const resolvedStyle = kartei.hasCheckbox && e.resolved;
  const checkbox = kartei.hasCheckbox ? `<button class="thread-check ${e.resolved?'done':''}" onclick="toggleKarteiEntryResolved('${kartei.id}','${e.id}')">${e.resolved?'✓':''}</button>` : '';
  return `<div class="row">
      ${checkbox}
      <button style="flex:1;text-align:left;color:${resolvedStyle?'var(--text-faint)':'var(--text)'};font-size:14px;font-weight:600;${resolvedStyle?'text-decoration:line-through;':''}" onclick="startEditKarteiEntry('${kartei.id}','${e.id}')">${escapeHtml(e.title)}</button>
    </div>
    ${e.notes ? `<div style="font-size:12px;color:var(--text-muted);white-space:pre-line;">${renderLinkedText(e.notes.length>80?e.notes.slice(0,80)+'…':e.notes)}</div>` : ''}`;
}
function renderKarteiTopLevelCard(kartei, e, children){
  const resolvedStyle = kartei.hasCheckbox && e.resolved;
  const checkbox = kartei.hasCheckbox ? `<button class="thread-check ${e.resolved?'done':''}" onclick="toggleKarteiEntryResolved('${kartei.id}','${e.id}')">${e.resolved?'✓':''}</button>` : '';
  const hasExtra = !!e.notes || children.length>0;
  const chevron = hasExtra
    ? `<button onclick="toggleKarteiEntryCollapse('${kartei.id}','${e.id}')" style="color:var(--text-faint);padding:0 2px;flex-shrink:0;">${e.collapsed?'▶':'▼'}</button>`
    : `<span style="width:16px;flex-shrink:0;"></span>`;
  let body = '';
  if(!e.collapsed){
    if(e.notes) body += `<div style="font-size:12px;color:var(--text-muted);white-space:pre-line;">${renderLinkedText(e.notes.length>80?e.notes.slice(0,80)+'…':e.notes)}</div>`;
    if(children.length){
      body += `<div style="display:flex;flex-direction:column;gap:8px;padding-left:12px;border-left:2px solid var(--border);margin-top:4px;">` +
        children.map(c=>`<div id="kartei-entry-${c.id}">${renderKarteiEntryCard(kartei,c)}</div>`).join('') +
        `</div>`;
    }
  } else if(children.length){
    body = `<span class="small-muted">${children.length} Untereinträge (eingeklappt)</span>`;
  }
  return `<div class="row">
      ${chevron}
      ${checkbox}
      <button style="flex:1;text-align:left;color:${resolvedStyle?'var(--text-faint)':'var(--text)'};font-size:14px;font-weight:600;${resolvedStyle?'text-decoration:line-through;':''}" onclick="startEditKarteiEntry('${kartei.id}','${e.id}')">${escapeHtml(e.title)}</button>
    </div>
    ${body}`;
}
function renderKarteiTab(karteiId){
  const active = getActive();
  const kartei = active.karteien.find(k=>k.id===karteiId);
  if(!kartei) return `<div class="panel empty"><span>Kartei nicht gefunden.</span></div>`;
  let html = '';
  if(ui.managing){
    html += `<div class="panel"><div class="row wrap" style="gap:8px;">
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="startRenameKartei('${kartei.id}')">✎ Umbenennen</button>
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="toggleKarteiCheckboxFeature('${kartei.id}')">${kartei.hasCheckbox?'☑':'☐'} Checkbox-Feld</button>
      <button class="btn btn-outline-wax" style="padding:6px 10px;font-size:12px;" onclick="deleteKartei('${kartei.id}')">🗑 Kartei löschen</button>
    </div></div>`;
  }
  html += `<div class="panel"><div class="row between"><span class="label">📇 ${escapeHtml(kartei.name)}</span>
    <button class="btn btn-gold" style="padding:4px 8px;font-size:12px;" onclick="startNewKarteiEntry('${kartei.id}')">+ Neu</button></div>`;
  const entryIds = new Set(kartei.entries.map(e=>e.id));
  const childrenOf = new Map();
  kartei.entries.forEach(e=>{
    if(e.parentId && entryIds.has(e.parentId)){
      if(!childrenOf.has(e.parentId)) childrenOf.set(e.parentId, []);
      childrenOf.get(e.parentId).push(e);
    }
  });
  const topLevel = kartei.entries.filter(e=>!e.parentId || !entryIds.has(e.parentId));
  if(topLevel.length===0){
    html += `<div class="empty"><span>Noch keine Einträge.</span>
      <button class="btn btn-raised" onclick="startNewKarteiEntry('${kartei.id}')">+ Ersten Eintrag anlegen</button></div>`;
  } else {
    html += `<div class="grid-cards">` + topLevel.map(e=>{
      const children = childrenOf.get(e.id) || [];
      return `<div class="npc-card" id="kartei-entry-${e.id}" style="display:flex;flex-direction:column;gap:6px;">${renderKarteiTopLevelCard(kartei,e,children)}</div>`;
    }).join('') + `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderKarteiEntryModal(){
  const {karteiId, id} = ui.editingKarteiEntry;
  const kartei = getActive().karteien.find(k=>k.id===karteiId);
  const isNew = id==='new';
  const hasChildren = kartei ? kartei.entries.some(e=>e.parentId===id) : false;
  let parentField = '';
  if(kartei && !hasChildren){
    const eligibleParents = kartei.entries.filter(e=>e.id!==id && !e.parentId);
    const options = `<option value="">— kein übergeordneter Eintrag —</option>` +
      eligibleParents.map(e=>`<option value="${e.id}" ${ui.karteiEntryDraft.parentId===e.id?'selected':''}>${escapeHtml(e.title)}</option>`).join('');
    parentField = `<select onchange="onKarteiEntryParent(this)" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:14px;">${options}</select>`;
  } else if(hasChildren){
    parentField = `<p class="small-muted">Hat eigene Untereinträge — kann daher nicht selbst untergeordnet werden.</p>`;
  }
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?`Neuer Eintrag`:'Eintrag bearbeiten'} — ${escapeHtml(kartei?kartei.name:'')}</span>
      <button class="icon-btn" onclick="cancelEditKarteiEntry()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.karteiEntryDraft.title)}" placeholder="Titel" oninput="onKarteiEntryTitle(this)">
    ${parentField}
    <textarea id="kartei-entry-notes-textarea" rows="8" placeholder="Notizen… [[Name]] verlinkt" oninput="onKarteiEntryNotes(this)">${escapeHtml(ui.karteiEntryDraft.notes)}</textarea>
    <button class="btn btn-raised" style="align-self:flex-start;padding:6px 10px;font-size:12px;" onclick="openLinkPicker('kartei')">🔗 Verlinken</button>
    ${kartei && kartei.hasCheckbox ? `<button class="row" onclick="toggleKarteiEntryDraftResolved()" style="gap:8px;">
      <span class="thread-check ${ui.karteiEntryDraft.resolved?'done':''}">${ui.karteiEntryDraft.resolved?'✓':''}</span>
      <span class="small-muted">Erledigt</span>
    </button>` : ''}
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteKarteiEntry()">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveKarteiEntry()">✓ Speichern</button>
    </div>
  </div></div>`;
}

function renderKarteiRenameModal(){
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Kartei umbenennen</span>
      <button class="icon-btn" onclick="cancelRenameKartei()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.karteiNameDraft)}" placeholder="Name der Kartei" oninput="onKarteiNameDraft(this)">
    <p class="small-muted">Der Name dient auch als Verlinkungs-Präfix, z.B. <code style="color:var(--gold);">[[${escapeHtml((ui.karteiNameDraft||'name').toLowerCase())}:Eintrag]]</code>. Bei Umbenennung brechen alte Präfix-Links.</p>
    <button class="btn btn-gold" onclick="saveKarteiName()">✓ Speichern</button>
  </div></div>`;
}
