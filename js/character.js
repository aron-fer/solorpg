// Charakter tab: characters, sections, fields.
// ---- Characters ----
function addCharacter(){
  const active = getActive();
  const newChar = {id:uid(), name:`Charakter ${active.characters.length+1}`, sections:[]};
  updateActive(camp=>({...camp, characters:[...camp.characters, newChar], activeCharacterId:newChar.id}));
  saveState(); render();
}
function setActiveCharacterId(id){
  updateActive(camp=>({...camp, activeCharacterId:id}));
  saveState(); render();
}
function duplicateCharacter(id){
  updateActive(camp=>{
    const idx = camp.characters.findIndex(c=>c.id===id);
    if(idx===-1) return camp;
    const copy = {...camp.characters[idx], id:uid(), name:camp.characters[idx].name+' (Kopie)'};
    const characters = [...camp.characters];
    characters.splice(idx+1,0,copy);
    return {...camp, characters, activeCharacterId:copy.id};
  });
  saveState(); render();
}
function startRenameCharacter(id){
  const char = getActive().characters.find(c=>c.id===id);
  ui.editingCharacterId = id; ui.characterNameDraft = char.name;
  render();
}
function onCharacterNameDraft(el){ ui.characterNameDraft = el.value; }
function cancelRenameCharacter(){ ui.editingCharacterId=null; render(); }
function saveCharacterName(){
  updateActive(camp=>({...camp, characters: camp.characters.map(c=>c.id===ui.editingCharacterId ? {...c, name: ui.characterNameDraft.trim()||'Charakter'} : c)}));
  ui.editingCharacterId=null; saveState(); render();
}
function deleteCharacter(id){
  updateActive(camp=>{
    const remaining = camp.characters.filter(c=>c.id!==id);
    const activeCharacterId = camp.activeCharacterId===id ? (remaining[0]?remaining[0].id:null) : camp.activeCharacterId;
    return {...camp, characters:remaining, activeCharacterId};
  });
  saveState(); render();
}

function toggleSectionCollapse(id){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===id?{...s,collapsed:!s.collapsed}:s)}));
  saveState(); render();
}
function startNewSection(){ ui.editingSectionId='new'; ui.sectionDraft={name:''}; render(); }
function moveSection(id, dir){
  updateCurrentCharacter(c=>{
    const arr = [...c.sections];
    const idx = arr.findIndex(s=>s.id===id);
    const newIdx = idx+dir;
    if(idx===-1 || newIdx<0 || newIdx>=arr.length) return c;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    return {...c, sections:arr};
  });
  saveState(); render();
}
function moveField(sectionId, fieldId, dir){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>{
    if(s.id!==sectionId) return s;
    const arr = [...s.fields];
    const idx = arr.findIndex(f=>f.id===fieldId);
    const newIdx = idx+dir;
    if(idx===-1 || newIdx<0 || newIdx>=arr.length) return s;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    return {...s, fields:arr};
  })}));
  saveState(); render();
}
function startEditSectionName(id){
  const s = getCurrentCharacter().sections.find(s=>s.id===id);
  ui.editingSectionId=id; ui.sectionDraft={name:s.name, quick:s.quick||null};
  render();
}
function cancelEditSection(){ ui.editingSectionId=null; render(); }
function onSectionDraftName(el){ ui.sectionDraft.name = el.value; }
function setSectionDraftQuick(v){ ui.sectionDraft.quick = v; render(); }
function saveSection(){
  const name = ui.sectionDraft.name.trim() || 'Unbenannter Bereich';
  if(ui.editingSectionId==='new'){
    updateCurrentCharacter(c=>({...c, sections:[...c.sections, {id:uid(), name, collapsed:false, quick:ui.sectionDraft.quick||null, fields:[]}]}));
  } else {
    updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===ui.editingSectionId?{...s,name,quick:ui.sectionDraft.quick||null}:s)}));
  }
  ui.editingSectionId=null; saveState(); render();
}
function deleteSection(id){
  updateCurrentCharacter(c=>({...c, sections: c.sections.filter(s=>s.id!==id)}));
  ui.editingSectionId=null; saveState(); render();
}
function startNewField(sectionId){ ui.editingFieldId='new'; ui.editingFieldSectionId=sectionId; ui.fieldDraft={name:'',type:'text',tier:'rare'}; render(); }
function startEditField(sectionId, fieldId){
  const s = getCurrentCharacter().sections.find(s=>s.id===sectionId);
  const f = s.fields.find(f=>f.id===fieldId);
  ui.editingFieldId=fieldId; ui.editingFieldSectionId=sectionId; ui.fieldDraft={name:f.name, type:f.type, tier:f.tier||'rare'};
  render();
}
function selectFieldTier(tier){ ui.fieldDraft.tier = tier; render(); }
function cancelEditField(){ ui.editingFieldId=null; render(); }
function onFieldDraftName(el){ ui.fieldDraft.name = el.value; }
function selectFieldType(type){ ui.fieldDraft.type = type; render(); }
function saveField(){
  const name = ui.fieldDraft.name.trim() || 'Unbenanntes Feld';
  const type = ui.fieldDraft.type;
  const tier = ui.fieldDraft.tier || 'rare';
  updateCurrentCharacter(c=>({
    ...c,
    sections: c.sections.map(s=>{
      if(s.id!==ui.editingFieldSectionId) return s;
      if(ui.editingFieldId==='new'){
        return {...s, fields:[...s.fields, {id:uid(), name, type, tier, value:defaultValueForType(type)}]};
      }
      return {...s, fields: s.fields.map(f=>{
        if(f.id!==ui.editingFieldId) return f;
        const typeChanged = f.type!==type;
        return {...f, name, type, tier, value: typeChanged ? defaultValueForType(type) : f.value};
      })};
    }),
  }));
  ui.editingFieldId=null; saveState(); render();
}
function deleteField(){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===ui.editingFieldSectionId?{...s, fields:s.fields.filter(f=>f.id!==ui.editingFieldId)}:s)}));
  ui.editingFieldId=null; saveState(); render();
}
function onFieldValueInput(sectionId, fieldId, el){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f,value:el.value}:f)}:s)}));
  saveState();
}
function incrementFieldCounter(sectionId, fieldId, delta){
  const s = getCurrentCharacter().sections.find(s=>s.id===sectionId);
  const f = s.fields.find(f=>f.id===fieldId);
  const num = parseFloat(f.value);
  const newVal = String((isNaN(num)?0:num)+delta);
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f,value:newVal}:f)}:s)}));
  saveState(); render();
}
function toggleStatusBox(sectionId, fieldId, boxIdx){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>{
    if(f.id!==fieldId) return f;
    const boxes = [...f.value];
    boxes[boxIdx] = !boxes[boxIdx];
    return {...f, value:boxes};
  })}:s)}));
  saveState(); render();
}
function reduceStatusTier(sectionId, fieldId, amount){
  amount = parseInt(amount,10);
  if(!amount || amount<1) return;
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>{
    if(f.id!==fieldId) return f;
    const boxes = [false,false,false,false,false,false];
    f.value.forEach((marked,idx)=>{
      if(!marked) return;
      const newIdx = idx - amount;
      if(newIdx>=0) boxes[newIdx] = true;
    });
    return {...f, value:boxes};
  })}:s)}));
  saveState(); render();
}
function clearStatusField(sectionId, fieldId){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f,value:[false,false,false,false,false,false]}:f)}:s)}));
  saveState(); render();
}
function updateTableField(sectionId, fieldId, updater){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id!==sectionId?s:{...s, fields:s.fields.map(f=>f.id===fieldId?{...f, value: updater(f.value)}:f)})}));
  saveState();
}
function addTableColumn(sectionId, fieldId){
  updateTableField(sectionId, fieldId, v=>({columns:[...v.columns, `Spalte ${v.columns.length+1}`], rows:v.rows.map(r=>[...r,''])}));
  render();
}
function renameTableColumn(sectionId, fieldId, colIdx, el){
  updateTableField(sectionId, fieldId, v=>({...v, columns:v.columns.map((c,i)=>i===colIdx?el.value:c)}));
}
function removeTableColumn(sectionId, fieldId, colIdx){
  updateTableField(sectionId, fieldId, v=>({columns:v.columns.filter((c,i)=>i!==colIdx), rows:v.rows.map(r=>r.filter((c,i)=>i!==colIdx))}));
  render();
}
function addTableRow(sectionId, fieldId){
  updateTableField(sectionId, fieldId, v=>({...v, rows:[...v.rows, v.columns.map(()=>'')]}));
  render();
}
function removeTableRow(sectionId, fieldId, rowIdx){
  updateTableField(sectionId, fieldId, v=>({...v, rows:v.rows.filter((r,i)=>i!==rowIdx)}));
  render();
}
function onTableCellInput(sectionId, fieldId, rowIdx, colIdx, el){
  updateTableField(sectionId, fieldId, v=>({...v, rows:v.rows.map((r,i)=>i!==rowIdx?r:r.map((c,j)=>j===colIdx?el.value:c))}));
}
function addListItem(sectionId, fieldId, inputEl){
  const text = inputEl.value.trim();
  if(!text) return;
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f,value:[...f.value,text]}:f)}:s)}));
  inputEl.value='';
  saveState(); render();
}
function removeListItem(sectionId, fieldId, idx){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f,value:f.value.filter((_,i)=>i!==idx)}:f)}:s)}));
  saveState(); render();
}

// ---- Spell slots (Vancian): per spell level a number of slots, each filled
// with one individually prepared spell that gets struck off when cast. ----
function normSpellValue(v){
  const levels = (v && Array.isArray(v.levels) ? v.levels : []).map(l=>({
    slots: Math.max(0, parseInt(l && l.slots)||0),
    prepared: (l && Array.isArray(l.prepared) ? l.prepared : []).map(p=>({name:String((p&&p.name)||''), cast:!!(p&&p.cast)})),
  }));
  return {levels: levels.length ? levels : [{slots:1, prepared:[]}]};
}
function updateSpellField(sectionId, fieldId, updater){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f, value:updater(normSpellValue(f.value))}:f)}:s)}));
  saveState(); render();
}
function mapSpellLevel(v, li, fn){ return {...v, levels: v.levels.map((l,i)=>i===li?fn(l):l)}; }
function prepareSpell(sectionId, fieldId, li, inputEl){
  const name = inputEl.value.trim();
  if(!name) return;
  updateSpellField(sectionId, fieldId, v=>mapSpellLevel(v, li, l=>({...l, prepared:[...l.prepared, {name, cast:false}]})));
}
function toggleSpellCast(sectionId, fieldId, li, pi){
  updateSpellField(sectionId, fieldId, v=>mapSpellLevel(v, li, l=>({...l, prepared:l.prepared.map((p,i)=>i===pi?{...p, cast:!p.cast}:p)})));
}
function removePreparedSpell(sectionId, fieldId, li, pi){
  updateSpellField(sectionId, fieldId, v=>mapSpellLevel(v, li, l=>({...l, prepared:l.prepared.filter((_,i)=>i!==pi)})));
}
function setSpellSlots(sectionId, fieldId, li, el){
  updateSpellField(sectionId, fieldId, v=>mapSpellLevel(v, li, l=>({...l, slots:Math.max(0, parseInt(el.value)||0)})));
}
function addSpellLevel(sectionId, fieldId){
  updateSpellField(sectionId, fieldId, v=>({...v, levels:[...v.levels, {slots:0, prepared:[]}]}));
}
function removeSpellLevel(sectionId, fieldId){
  updateSpellField(sectionId, fieldId, v=>({...v, levels: v.levels.length>1 ? v.levels.slice(0,-1) : v.levels}));
}
// New day: every prepared spell is available again (same preparation).
function restSpells(sectionId, fieldId){
  updateSpellField(sectionId, fieldId, v=>({...v, levels: v.levels.map(l=>({...l, prepared:l.prepared.map(p=>({...p, cast:false}))}))}));
}
function renderSpellControl(sectionId, f){
  const v = normSpellValue(f.value);
  const ready = v.levels.reduce((n,l)=>n+l.prepared.filter(p=>!p.cast).length, 0);
  const slots = v.levels.reduce((n,l)=>n+l.slots, 0);
  // Suggestions: entries of list fields in the same section (e.g. Known Spells).
  const char = getCurrentCharacter();
  const section = char && char.sections.find(s=>s.id===sectionId);
  const suggestions = [...new Set((section ? section.fields : []).filter(x=>x.type==='list' && Array.isArray(x.value)).flatMap(x=>x.value))];
  const dlId = `spellsugg-${f.id}`;
  const rows = v.levels.map((l,li)=>{
    if(!ui.managing && l.slots===0 && !l.prepared.length) return '';
    const avail = l.prepared.filter(p=>!p.cast).length;
    const free = l.slots - l.prepared.length;
    const inputId = `spellinput-${f.id}-${li}`;
    return `<div style="display:flex;flex-direction:column;gap:6px;padding:8px 0;border-top:1px solid var(--border);">
      <div class="row" style="gap:6px;flex-wrap:wrap;">
        <span style="font-weight:600;min-width:58px;">Level ${li+1}</span>
        <span class="small-muted">·</span>
        <span style="font-weight:700;color:${avail?'var(--gold)':'var(--text-faint)'};">${avail}</span><span class="small-muted">of ${l.slots} available</span>
        ${free>0 ? `<span class="small-muted">· ${free} unprepared</span>` : ''}
        ${free<0 ? `<span class="small-muted">· ${-free} over slots</span>` : ''}
        ${ui.managing ? `<span class="row" style="gap:4px;margin-left:auto;"><span class="small-muted">Slots</span><input type="number" min="0" value="${l.slots}" onchange="setSpellSlots('${sectionId}','${f.id}',${li},this)" style="width:56px;text-align:center;"></span>` : ''}
      </div>
      ${l.prepared.length ? `<div class="row" style="gap:6px;flex-wrap:wrap;">
        ${l.prepared.map((p,pi)=>`<span class="row" style="gap:2px;border:1px solid var(--border);border-radius:8px;padding:2px 2px 2px 8px;${p.cast?'opacity:0.45;':''}">
          <button style="font-size:14px;text-align:left;${p.cast?'text-decoration:line-through;':''}" title="${p.cast?'Mark as available':'Mark as cast'}" onclick="toggleSpellCast('${sectionId}','${f.id}',${li},${pi})">${escapeHtml(p.name)}</button>
          <button class="x-btn" title="Remove" onclick="removePreparedSpell('${sectionId}','${f.id}',${li},${pi})">✕</button>
        </span>`).join('')}
      </div>` : ''}
      ${free>0 ? `<div class="row">
        <input type="text" id="${inputId}" list="${dlId}" placeholder="Prepare a spell…" onkeydown="if(event.key==='Enter'){prepareSpell('${sectionId}','${f.id}',${li},this);}" style="flex:1;">
        <button class="btn btn-gold" style="padding:8px 12px;" onclick="prepareSpell('${sectionId}','${f.id}',${li},document.getElementById('${inputId}'))">+</button>
      </div>` : ''}
    </div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;">
    <div class="row" style="gap:8px;padding-bottom:6px;">
      <span style="font-size:20px;font-weight:700;color:${ready?'var(--gold)':'var(--text-faint)'};">${ready}</span>
      <span class="small-muted">of ${slots} spells available</span>
      <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;margin-left:auto;" title="All prepared spells available again" onclick="restSpells('${sectionId}','${f.id}')">↺ New day</button>
    </div>
    ${rows}
    ${ui.managing ? `<div class="row" style="gap:6px;padding-top:6px;">
      <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="addSpellLevel('${sectionId}','${f.id}')">+ Level</button>
      ${v.levels.length>1 ? `<button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="removeSpellLevel('${sectionId}','${f.id}')">− Level</button>` : ''}
    </div>` : ''}
    ${suggestions.length ? `<datalist id="${dlId}">${suggestions.map(x=>`<option value="${escapeHtml(x)}">`).join('')}</datalist>` : ''}
  </div>`;
}

function renderFieldControl(sectionId, f){
  if(f.type==='spells') return renderSpellControl(sectionId, f);
  if(f.type==='number'){
    return `<input type="number" value="${escapeHtml(f.value)}" oninput="onFieldValueInput('${sectionId}','${f.id}',this)" style="width:96px;">`;
  } else if(f.type==='counter'){
    return `<div class="row" style="gap:12px;">
      <button class="counter-btn" onclick="incrementFieldCounter('${sectionId}','${f.id}',-1)">−</button>
      <input type="number" value="${escapeHtml(f.value)}" oninput="onFieldValueInput('${sectionId}','${f.id}',this)" style="width:64px;text-align:center;font-weight:600;">
      <button class="counter-btn" onclick="incrementFieldCounter('${sectionId}','${f.id}',1)">+</button>
    </div>`;
  } else if(f.type==='text'){
    return `<textarea rows="3" oninput="onFieldValueInput('${sectionId}','${f.id}',this)">${escapeHtml(f.value)}</textarea>`;
  } else if(f.type==='list'){
    return `<div style="display:flex;flex-direction:column;gap:6px;">
      ${f.value.map((item,idx)=>`<div class="list-item-row"><span style="flex:1;font-size:14px;">${escapeHtml(item)}</span><button class="x-btn" onclick="removeListItem('${sectionId}','${f.id}',${idx})">✕</button></div>`).join('')}
      <div class="row">
        <input type="text" placeholder="Neuer Eintrag…" onkeydown="if(event.key==='Enter'){addListItem('${sectionId}','${f.id}',this);}" style="flex:1;" id="listinput-${f.id}">
        <button class="btn btn-gold" style="padding:8px 12px;" onclick="addListItem('${sectionId}','${f.id}', document.getElementById('listinput-${f.id}'))">+</button>
      </div>
    </div>`;
  } else if(f.type==='status'){
    const inputId = `statusreduce-${f.id}`;
    return renderStatusControl(
      f.value,
      idx=>`toggleStatusBox('${sectionId}','${f.id}',${idx})`,
      iid=>`reduceStatusTier('${sectionId}','${f.id}', document.getElementById('${iid}').value)`,
      ()=>`clearStatusField('${sectionId}','${f.id}')`,
      inputId
    );
  } else if(f.type==='table'){
    const tv = f.value;
    return `<div style="display:flex;flex-direction:column;gap:6px;">
      <div style="overflow-x:auto;padding-bottom:12px;scrollbar-gutter:stable;">
        <table style="border-collapse:collapse;width:100%;min-width:${Math.max(300, tv.columns.length*110)}px;">
          <thead><tr>
            ${tv.columns.map((c,ci)=>`<th style="padding:2px 4px;text-align:left;">
              <div class="row" style="gap:2px;">
                <input type="text" value="${escapeHtml(c)}" oninput="renameTableColumn('${sectionId}','${f.id}',${ci},this)" style="font-size:11px;font-weight:600;padding:4px 6px;">
                ${ui.managing ? `<button class="x-btn" onclick="removeTableColumn('${sectionId}','${f.id}',${ci})">✕</button>` : ''}
              </div>
            </th>`).join('')}
            <th style="width:24px;"></th>
          </tr></thead>
          <tbody>
            ${tv.rows.map((row,ri)=>`<tr>
              ${row.map((cell,ci)=>`<td style="padding:2px;"><input type="text" value="${escapeHtml(cell)}" oninput="onTableCellInput('${sectionId}','${f.id}',${ri},${ci},this)" style="font-size:13px;padding:5px 6px;"></td>`).join('')}
              <td><button class="x-btn" onclick="removeTableRow('${sectionId}','${f.id}',${ri})">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="row" style="gap:6px;">
        <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="addTableRow('${sectionId}','${f.id}')">+ Zeile</button>
        <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="addTableColumn('${sectionId}','${f.id}')">+ Spalte</button>
      </div>
    </div>`;
  }
  return '';
}
// opts.quick ({key, idx, len}): in the quick view the ↑↓ arrows reorder the
// quick-view items instead of moving the field inside its section;
// opts.inBlock: field inside a whole-section block there — only ✎.
function renderFieldRow(section, f, fIdx, showTierBadge, opts){
  opts = opts || {};
  const tierBadge = showTierBadge ? {surface:'⏱ jede Runde', scene:'◷ pro Szene', rare:'· selten'}[f.tier||'rare'] : '';
  let controls = '';
  if(ui.managing){
    const edit = `<button class="x-btn" onclick="startEditField('${section.id}','${f.id}')">✎</button>`;
    if(opts.inBlock) controls = edit;
    else if(opts.quick) controls = quickMoveButtons(opts.quick) + edit;
    else controls = `<button class="icon-btn" style="${fIdx===0?'opacity:0.3;':''}" ${fIdx===0?'disabled':''} onclick="moveField('${section.id}','${f.id}',-1)">↑</button>
        <button class="icon-btn" style="${fIdx===section.fields.length-1?'opacity:0.3;':''}" ${fIdx===section.fields.length-1?'disabled':''} onclick="moveField('${section.id}','${f.id}',1)">↓</button>
        ${edit}`;
  }
  return `<div style="display:flex;flex-direction:column;gap:6px;">
    <div class="field-label-row">
      <span class="small-muted">${escapeHtml(f.name)}${tierBadge?` <span style="opacity:0.6;">(${tierBadge})</span>`:''}</span>
      ${controls ? `<div class="row" style="gap:2px;">${controls}</div>` : ''}
    </div>
    ${renderFieldControl(section.id, f)}
  </div>`;
}
function setCharacterViewMode(mode){ ui.characterViewMode = mode; render(); }
function renderCharacterTab(){
  const active = getActive();
  const currentChar = getCurrentCharacter();
  let html = `<div class="pill-scroll">`;
  html += active.characters.map(char=>{
    const isActive = currentChar && char.id===currentChar.id;
    return `<button class="pill ${isActive?'active':'inactive'}" onclick="setActiveCharacterId('${char.id}')">${escapeHtml(char.name)}</button>`;
  }).join('');
  html += `<button class="icon-btn raised" style="border-radius:999px;" onclick="addCharacter()">+</button>`;
  html += `</div>`;

  if(currentChar){
    html += `<div class="mode-toggle">
      <button style="${ui.characterViewMode==='full'?'background:var(--gold);color:var(--bg);':''}" onclick="setCharacterViewMode('full')">Vollständig</button>
      <button style="${ui.characterViewMode==='quick'?'background:var(--gold);color:var(--bg);':''}" onclick="setCharacterViewMode('quick')">Kurzansicht</button>
    </div>`;
  }

  if(ui.managing && currentChar){
    html += `<div class="row wrap" style="gap:8px;">
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="startRenameCharacter('${currentChar.id}')">✎ Umbenennen</button>
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="duplicateCharacter('${currentChar.id}')">⧉ Duplizieren</button>
      <button class="btn btn-outline-wax" style="padding:6px 10px;font-size:12px;" onclick="deleteCharacter('${currentChar.id}')">🗑 Löschen</button>
      <button class="btn btn-gold" style="padding:6px 10px;font-size:12px;margin-left:auto;" onclick="startNewSection()">+ Neuer Bereich</button>
    </div>`;
  }

  if(!currentChar){
    html += `<div class="panel empty"><span>Noch kein Charakter angelegt.</span>
      <button class="btn btn-raised" onclick="addCharacter()">+ Ersten Charakter anlegen</button></div>`;
    return html;
  }

  if(currentChar.sections.length===0){
    html += `<div class="panel empty"><span>Noch keine Bereiche angelegt. Über das Zahnrad oben gelangst du in den Bearbeitungsmodus.</span>
      <button class="btn btn-raised" onclick="startNewSection()">+ Ersten Bereich anlegen</button></div>`;
    return html;
  }

  if(ui.characterViewMode==='quick'){
    html += renderCharacterQuickView(currentChar);
    return html;
  }

  html += `<div class="masonry-cards">`;
  html += currentChar.sections.map((section, sIdx)=>{
    let fieldsHtml = '';
    if(section.fields.length===0){
      fieldsHtml = `<p class="small-muted">${ui.managing?'Noch keine Felder — tippe oben auf + um eines hinzuzufügen.':'Keine Felder in diesem Bereich.'}</p>`;
    } else {
      fieldsHtml = section.fields.map((f,fIdx)=>renderFieldRow(section, f, fIdx, false)).join('');
    }
    return `<div class="panel">
      <div class="row">
        <button class="row" style="flex:1;text-align:left;" onclick="toggleSectionCollapse('${section.id}')">
          <span style="color:var(--text-faint);">${section.collapsed?'▶':'▼'}</span>
          <span style="color:var(--gold);font-weight:600;font-size:14px;">${escapeHtml(section.name)}</span>
          ${section.quick ? `<span class="small-muted" title="Ganzer Bereich in der Kurzansicht">${section.quick==='surface' ? '⏱ Kurzansicht' : '◷ Kurzansicht'}</span>` : ''}
        </button>
        ${ui.managing ? `<div class="row" style="gap:4px;">
          <button class="icon-btn" style="${sIdx===0?'opacity:0.3;':''}" ${sIdx===0?'disabled':''} onclick="moveSection('${section.id}',-1)">↑</button>
          <button class="icon-btn" style="${sIdx===currentChar.sections.length-1?'opacity:0.3;':''}" ${sIdx===currentChar.sections.length-1?'disabled':''} onclick="moveSection('${section.id}',1)">↓</button>
          <button class="icon-btn" onclick="startEditSectionName('${section.id}')">✎</button>
          <button class="icon-btn" onclick="startNewField('${section.id}')">+</button>
        </div>` : ''}
      </div>
      ${!section.collapsed ? `<div style="display:flex;flex-direction:column;gap:12px;padding-left:4px;">${fieldsHtml}</div>` : ''}
    </div>`;
  }).join('');
  html += `</div>`;
  return html;
}
// Quick/reference view: flattens every section's fields into three tiers by
// how often they get looked up, ignoring section boundaries. A section can
// also be put in as a whole (section.quick = 'surface' | 'scene'): it then
// shows as one titled block with all its fields. Items in "jede Runde" and
// "pro Szene" can be reordered by hand (character.quickOrder, keys
// 'f:<fieldId>' / 's:<sectionId>'); items not in that list come last.
function quickViewGroups(currentChar){
  const groups = {surface:[], scene:[], rare:[]};
  currentChar.sections.forEach(section=>{
    if(section.quick){ groups[section.quick].push({key:'s:'+section.id, section}); return; }
    section.fields.forEach((f,fIdx)=>groups[f.tier==='surface'||f.tier==='scene' ? f.tier : 'rare'].push({key:'f:'+f.id, section, f, fIdx}));
  });
  const pos = new Map((currentChar.quickOrder||[]).map((k,i)=>[k,i]));
  const rank = it => pos.has(it.key) ? pos.get(it.key) : Infinity;
  ['surface','scene'].forEach(t=>{
    groups[t] = groups[t].map((it,i)=>({it,i})).sort((a,b)=>(rank(a.it)-rank(b.it)) || (a.i-b.i)).map(x=>x.it);
  });
  return groups;
}
function moveQuickItem(key, dir){
  const groups = quickViewGroups(getCurrentCharacter());
  const lists = ['surface','scene'].map(t=>groups[t].map(it=>it.key));
  const list = lists.find(l=>l.includes(key));
  if(!list) return;
  const idx = list.indexOf(key), newIdx = idx+dir;
  if(newIdx<0 || newIdx>=list.length) return;
  [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
  updateCurrentCharacter(c=>({...c, quickOrder:[...lists[0], ...lists[1]]}));
  saveState(); render();
}
function quickMoveButtons(q){
  return `<button class="icon-btn" style="${q.idx===0?'opacity:0.3;':''}" ${q.idx===0?'disabled':''} onclick="moveQuickItem('${q.key}',-1)">↑</button>
    <button class="icon-btn" style="${q.idx===q.len-1?'opacity:0.3;':''}" ${q.idx===q.len-1?'disabled':''} onclick="moveQuickItem('${q.key}',1)">↓</button>`;
}
function renderCharacterQuickView(currentChar){
  const groups = quickViewGroups(currentChar);
  const card = (it, idx, len) => {
    const q = {key:it.key, idx, len};
    if(it.f) return `<div class="panel">${renderFieldRow(it.section, it.f, it.fIdx, false, {quick:q})}</div>`;
    const section = it.section;
    return `<div class="panel">
      <div class="field-label-row">
        <span style="color:var(--gold);font-weight:600;font-size:14px;">${escapeHtml(section.name)}</span>
        ${ui.managing ? `<div class="row" style="gap:2px;">${quickMoveButtons(q)}<button class="x-btn" onclick="startEditSectionName('${section.id}')">✎</button></div>` : ''}
      </div>
      ${section.fields.length
        ? `<div style="display:flex;flex-direction:column;gap:10px;padding-left:4px;">${section.fields.map((f,fIdx)=>renderFieldRow(section,f,fIdx,false,{inBlock:true})).join('')}</div>`
        : `<p class="small-muted" style="margin:0;">Keine Felder in diesem Bereich.</p>`}
    </div>`;
  };
  const tierBlock = (label, items, top) => items.length
    ? `<p class="label" style="margin:${top}px 0 0;">${label}</p><div class="masonry-cards">${items.map((it,i)=>card(it,i,items.length)).join('')}</div>`
    : '';
  let html = tierBlock('jede Runde', groups.surface, 2) + tierBlock('pro Szene', groups.scene, 4);
  if(!groups.surface.length && !groups.scene.length){
    html += `<div class="panel empty"><span class="small-muted">Noch nichts für die Kurzansicht markiert. Über das Zahnrad (⚙) in der Vollansicht kannst du ein Feld als „Jede Runde" oder „Pro Szene" einstellen — oder mit ✎ am Bereich gleich einen ganzen Bereich (z.B. Saving Throws).</span></div>`;
  } else if(ui.managing){
    html += `<p class="small-muted" style="margin:0;">Mit ↑↓ sortieren — die Reihenfolge läuft spaltenweise von oben nach unten.</p>`;
  }
  if(groups.rare.length){
    html += `<details style="margin-top:4px;">
      <summary class="small-muted" style="cursor:pointer;">▸ selten — ${groups.rare.length} weitere Felder</summary>
      <div class="panel" style="margin-top:8px;">${groups.rare.map(({section,f,fIdx})=>renderFieldRow(section,f,fIdx,false,{inBlock:true})).join('<div style="height:8px;"></div>')}</div>
    </details>`;
  }
  return html;
}

function renderSectionModal(){
  const isNew = ui.editingSectionId==='new';
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?'Neuer Bereich':'Bereich umbenennen'}</span>
      <button class="icon-btn" onclick="cancelEditSection()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.sectionDraft.name)}" placeholder="Name des Bereichs, z.B. Attribute" oninput="onSectionDraftName(this)">
    <span class="small-muted">In der Kurzansicht:</span>
    <div class="mode-toggle">
      <button style="${!ui.sectionDraft.quick?'background:var(--gold);color:var(--bg);':''}" onclick="setSectionDraftQuick(null)">Einzeln nach Feldern</button>
      <button style="${ui.sectionDraft.quick==='surface'?'background:var(--gold);color:var(--bg);':''}" onclick="setSectionDraftQuick('surface')">Ganzer Bereich · jede Runde</button>
      <button style="${ui.sectionDraft.quick==='scene'?'background:var(--gold);color:var(--bg);':''}" onclick="setSectionDraftQuick('scene')">Ganzer Bereich · pro Szene</button>
    </div>
    <p class="small-muted" style="margin:0;">„Ganzer Bereich" zeigt den Bereich in der Kurzansicht als eigenen Block mit allen Feldern — die Häufigkeit der einzelnen Felder zählt dann für diesen Bereich nicht.</p>
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteSection('${ui.editingSectionId}')">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveSection()">✓ Speichern</button>
    </div>
  </div></div>`;
}

function renderFieldModal(){
  const isNew = ui.editingFieldId==='new';
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?'Neues Feld':'Feld bearbeiten'}</span>
      <button class="icon-btn" onclick="cancelEditField()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.fieldDraft.name)}" placeholder="Name des Feldes, z.B. Stärke" oninput="onFieldDraftName(this)">
    <span class="small-muted">Feldtyp:</span>
    <div class="field-type-grid">
      ${FIELD_TYPES.map(ft=>`<button class="field-type-btn ${ui.fieldDraft.type===ft.id?'selected':''}" onclick="selectFieldType('${ft.id}')">${escapeHtml(ft.label)}</button>`).join('')}
    </div>
    <span class="small-muted">Wie oft wird das nachgeschlagen? (für die Kurzansicht)</span>
    <div class="mode-toggle">
      <button style="${ui.fieldDraft.tier==='surface'?'background:var(--gold);color:var(--bg);':''}" onclick="selectFieldTier('surface')">Jede Runde</button>
      <button style="${ui.fieldDraft.tier==='scene'?'background:var(--gold);color:var(--bg);':''}" onclick="selectFieldTier('scene')">Pro Szene</button>
      <button style="${(!ui.fieldDraft.tier||ui.fieldDraft.tier==='rare')?'background:var(--gold);color:var(--bg);':''}" onclick="selectFieldTier('rare')">Selten</button>
    </div>
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteField()">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveField()">✓ Speichern</button>
    </div>
  </div></div>`;
}
