// Text tab: journal entries.
function renderNotesTab(){
  const active = getActive();
  let html = `<div class="row between">
    <span class="label">📜 Text</span>
    <button class="btn btn-gold" style="padding:4px 8px;font-size:12px;" onclick="addJournalEntry()">+ Neuer Eintrag</button>
  </div>`;
  if(active.journal.length===0){
    html += `<div class="panel empty"><span>Noch keine Einträge.</span>
      <button class="btn btn-raised" onclick="addJournalEntry()">+ Ersten Eintrag anlegen</button></div>`;
    return html;
  }
  html += active.journal.map(entry=>{
    const isEditing = ui.journalEditingId===entry.id;
    let content = '';
    if(!entry.collapsed){
      const typeToggle = `<div class="row" style="gap:4px;">
        <button class="icon-btn raised" style="padding:5px 7px;font-size:12px;${entry.type==='text'?'color:var(--gold);border-color:var(--gold);':''}" onclick="setJournalType('${entry.id}','text')" title="Freitext">Aa</button>
        <button class="icon-btn raised" style="padding:5px 7px;font-size:12px;${entry.type==='list'?'color:var(--gold);border-color:var(--gold);':''}" onclick="setJournalType('${entry.id}','list')" title="Liste">☰</button>
      </div>`;
      if(entry.type==='list'){
        const items = entry.value || [];
        content = `<div style="display:flex;flex-direction:column;gap:8px;">
          ${typeToggle}
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${items.map((item,idx)=>`<div class="list-item-row"><span style="flex:1;font-size:14px;">${renderLinkedText(item)}</span><button class="x-btn" onclick="removeJournalListItem('${entry.id}',${idx})">✕</button></div>`).join('')}
            <div class="row">
              <input type="text" placeholder="Neuer Eintrag…" onkeydown="if(event.key==='Enter'){addJournalListItem('${entry.id}',this);}" style="flex:1;" id="journal-list-input-${entry.id}">
              <button class="btn btn-gold" style="padding:8px 12px;" onclick="addJournalListItem('${entry.id}', document.getElementById('journal-list-input-${entry.id}'))">+</button>
            </div>
          </div>
        </div>`;
      } else {
        if(isEditing){
          content = `<div style="display:flex;flex-direction:column;gap:8px;">
            ${typeToggle}
            <textarea id="journal-content-textarea-${entry.id}" rows="6" placeholder="Freitext… [[Name]] verlinkt auf NSC/Ort/Thread/Eintrag" oninput="onJournalValueInput('${entry.id}',this)">${escapeHtml(entry.value)}</textarea>
            <div class="row">
              <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="openLinkPicker('journal','${entry.id}')">🔗 Verlinken</button>
              <button class="btn btn-raised" style="margin-left:auto;" onclick="finishEditJournalContent()">✓ Fertig</button>
            </div>
          </div>`;
        } else {
          const rendered = entry.value ? renderLinkedText(entry.value) : `<span class="small-muted">(leer)</span>`;
          content = `<div style="display:flex;flex-direction:column;gap:8px;">
            ${typeToggle}
            <div style="font-size:14px;white-space:pre-line;line-height:1.5;">${rendered}</div>
            <button class="btn btn-raised" style="align-self:flex-start;padding:6px 10px;font-size:12px;" onclick="startEditJournalContent('${entry.id}')">✎ Bearbeiten</button>
          </div>`;
        }
      }
    }
    return `<div class="panel" id="journal-${entry.id}">
      <div class="row between">
        <button class="row" style="flex:1;text-align:left;" onclick="toggleJournalCollapse('${entry.id}')">
          <span style="color:var(--text-faint);">${entry.collapsed?'▶':'▼'}</span>
          <input type="text" value="${escapeHtml(entry.title)}" placeholder="Titel…" oninput="onJournalTitleInput('${entry.id}',this)" onclick="event.stopPropagation()" style="flex:1;background:none;border:none;font-weight:600;color:var(--gold);padding:2px 0;">
        </button>
        <button class="x-btn" onclick="deleteJournalEntry('${entry.id}')">🗑</button>
      </div>
      ${content}
    </div>`;
  }).join('');
  return html;
}
function addJournalEntry(){
  const id = uid();
  updateActive(camp=>({...camp, journal: [{id, title:'', type:'text', value:'', collapsed:false}, ...camp.journal]}));
  ui.journalEditingId = id;
  saveState(); render();
}
function toggleJournalCollapse(id){
  updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===id?{...j, collapsed:!j.collapsed}:j)}));
  saveState(); render();
}
function setJournalType(id, type){
  updateActive(camp=>({...camp, journal: camp.journal.map(j=>{
    if(j.id!==id) return j;
    if(j.type===type) return j;
    return {...j, type, value: type==='list' ? [] : ''};
  })}));
  saveState(); render();
}
function onJournalTitleInput(id, el){
  updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===id?{...j, title:el.value}:j)}));
  saveState();
}
function onJournalValueInput(id, el){
  updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===id?{...j, value:el.value}:j)}));
  saveState();
}
function startEditJournalContent(id){ ui.journalEditingId=id; render(); }
function finishEditJournalContent(){ ui.journalEditingId=null; saveState(); render(); }
function addJournalListItem(id, inputEl){
  const text = inputEl.value.trim();
  if(!text) return;
  updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===id?{...j, value:[...(j.value||[]),text]}:j)}));
  inputEl.value='';
  saveState(); render();
}
function removeJournalListItem(id, idx){
  updateActive(camp=>({...camp, journal: camp.journal.map(j=>j.id===id?{...j, value:j.value.filter((_,i)=>i!==idx)}:j)}));
  saveState(); render();
}
function deleteJournalEntry(id){
  updateActive(camp=>({...camp, journal: camp.journal.filter(j=>j.id!==id)}));
  if(ui.journalEditingId===id) ui.journalEditingId=null;
  saveState(); render();
}
