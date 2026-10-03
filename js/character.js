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
  ui.editingSectionId=id; ui.sectionDraft={name:s.name};
  render();
}
function cancelEditSection(){ ui.editingSectionId=null; render(); }
function onSectionDraftName(el){ ui.sectionDraft.name = el.value; }
function saveSection(){
  const name = ui.sectionDraft.name.trim() || 'Unbenannter Bereich';
  if(ui.editingSectionId==='new'){
    updateCurrentCharacter(c=>({...c, sections:[...c.sections, {id:uid(), name, collapsed:false, fields:[]}]}));
  } else {
    updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===ui.editingSectionId?{...s,name}:s)}));
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
// ---- Slots field (rows of boxes, e.g. spells per day) ----
function updateSlots(sectionId, fieldId, fn){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f, value: normalizeSlots(fn(f.value.map(r=>({...r}))))}:f)}:s)}));
  saveState(); render();
}
// Tapping a used box frees it and every box after it; a free box marks up to it.
function toggleSlot(sectionId, fieldId, row, idx){
  updateSlots(sectionId, fieldId, rows=>{ const r = rows[row]; r.used = idx < r.used ? idx : idx+1; return rows; });
}
function changeSlotMax(sectionId, fieldId, row, delta){
  updateSlots(sectionId, fieldId, rows=>{ rows[row].max += delta; return rows; });
}
function addSlotRow(sectionId, fieldId){ updateSlots(sectionId, fieldId, rows=>[...rows, {label:'Stufe '+(rows.length+1), max:1, used:0}]); }
function removeSlotRow(sectionId, fieldId, row){ updateSlots(sectionId, fieldId, rows=>rows.filter((_,i)=>i!==row)); }
function onSlotLabelInput(sectionId, fieldId, row, el){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>s.id===sectionId?{...s, fields:s.fields.map(f=>f.id===fieldId?{...f, value: f.value.map((r,i)=>i===row?{...r, label:el.value}:r)}:f)}:s)}));
  saveState();
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

function renderFieldControl(sectionId, f){
  if(f.type==='number'){
    return `<input type="number" value="${escapeHtml(f.value)}" oninput="onFieldValueInput('${sectionId}','${f.id}',this)" style="width:96px;">`;
  } else if(f.type==='counter'){
    return `<div class="row" style="gap:12px;">
      <button class="counter-btn" onclick="incrementFieldCounter('${sectionId}','${f.id}',-1)">−</button>
      <input type="number" value="${escapeHtml(f.value)}" oninput="onFieldValueInput('${sectionId}','${f.id}',this)" style="width:64px;text-align:center;font-weight:600;">
      <button class="counter-btn" onclick="incrementFieldCounter('${sectionId}','${f.id}',1)">+</button>
    </div>`;
  } else if(f.type==='text'){
    // Short values (class, race, …) get a one-line box; longer ones three lines.
    const v = String(f.value||''), rows = (v.length>40 || v.includes('\n')) ? 3 : 1;
    return `<textarea rows="${rows}" style="field-sizing:content;" oninput="onFieldValueInput('${sectionId}','${f.id}',this)">${escapeHtml(v)}</textarea>`;
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
  } else if(f.type==='slots'){
    const args = `'${sectionId}','${f.id}'`;
    // Outside edit mode, rows with 0 boxes (spell levels not reached yet) are hidden.
    const rows = f.value.map((r,ri)=>{
      if(!ui.managing && r.max===0) return '';
      const boxes = Array.from({length:r.max}, (_,i)=>{
        const on = i < r.used;
        return `<button onclick="toggleSlot(${args},${ri},${i})" title="${on?'wieder frei':'verbraucht'}" style="width:26px;height:26px;border-radius:6px;border:1.5px solid ${on?'var(--gold-dim)':'var(--gold)'};background:${on?'var(--gold-dim)':'transparent'};color:var(--bg);font-size:13px;line-height:1;">${on?'✕':''}</button>`;
      }).join('');
      return `<div class="row wrap" style="gap:6px;">
        ${ui.managing
          ? `<input type="text" value="${escapeHtml(r.label)}" oninput="onSlotLabelInput(${args},${ri},this)" style="width:90px;font-size:13px;padding:4px 6px;">
             <button class="counter-btn" style="width:28px;height:28px;font-size:14px;" onclick="changeSlotMax(${args},${ri},-1)">−</button>
             <button class="counter-btn" style="width:28px;height:28px;font-size:14px;" onclick="changeSlotMax(${args},${ri},1)">+</button>`
          : `<span style="font-size:13px;min-width:64px;">${escapeHtml(r.label)}</span>`}
        ${boxes}
        <span class="small-muted">${r.max - r.used}/${r.max}</span>
        ${ui.managing ? `<button class="x-btn" style="margin-left:auto;" onclick="removeSlotRow(${args},${ri})">✕</button>` : ''}
      </div>`;
    }).join('');
    return `<div style="display:flex;flex-direction:column;gap:8px;">
      ${rows || '<p class="small-muted" style="margin:0;">Noch keine Kästchen — im Bearbeiten-Modus (⚙) mit + anlegen.</p>'}
      <div class="row" style="gap:6px;">
        ${ui.managing ? `<button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="addSlotRow(${args})">+ Zeile</button>` : ''}
      </div>
    </div>`;
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
function renderFieldRow(section, f, fIdx, showTierBadge){
  const tierBadge = showTierBadge ? {surface:'⏱ jede Runde', scene:'◷ pro Szene', rare:'· selten'}[f.tier||'rare'] : '';
  return `<div style="display:flex;flex-direction:column;gap:6px;">
    <div class="field-label-row">
      <span class="small-muted">${escapeHtml(f.name)}${tierBadge?` <span style="opacity:0.6;">(${tierBadge})</span>`:''}</span>
      ${ui.managing ? `<div class="row" style="gap:2px;">
        <button class="icon-btn" style="${fIdx===0?'opacity:0.3;':''}" ${fIdx===0?'disabled':''} onclick="moveField('${section.id}','${f.id}',-1)">↑</button>
        <button class="icon-btn" style="${fIdx===section.fields.length-1?'opacity:0.3;':''}" ${fIdx===section.fields.length-1?'disabled':''} onclick="moveField('${section.id}','${f.id}',1)">↓</button>
        <button class="x-btn" onclick="startEditField('${section.id}','${f.id}')">✎</button>
      </div>` : ''}
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
// how often they get looked up, ignoring section boundaries. Surface fields
// (usually counters — HP, ammo, slots) get the biggest, most tappable
// controls; rare fields (saves, gear, lore) sit collapsed at the bottom.
function renderCharacterQuickView(currentChar){
  const surface = [], scene = [], rare = [];
  currentChar.sections.forEach(section=>{
    section.fields.forEach((f,fIdx)=>{
      const entry = {section, f, fIdx};
      if(f.tier==='surface') surface.push(entry);
      else if(f.tier==='scene') scene.push(entry);
      else rare.push(entry);
    });
  });
  let html = '';
  if(surface.length){
    html += `<p class="label" style="margin:2px 0 0;">jede Runde</p>`;
    html += `<div class="grid-cards">` + surface.map(({section,f,fIdx})=>`<div class="panel">${renderFieldRow(section,f,fIdx,false)}</div>`).join('') + `</div>`;
  }
  if(scene.length){
    html += `<p class="label" style="margin:8px 0 0;">pro Szene</p>`;
    html += `<div class="panel">` + scene.map(({section,f,fIdx})=>renderFieldRow(section,f,fIdx,false)).join('<div style="height:8px;"></div>') + `</div>`;
  }
  if(!surface.length && !scene.length){
    html += `<div class="panel empty"><span class="small-muted">Noch keine Felder als „Jede Runde" oder „Pro Szene" markiert. Öffne ein Feld über das Zahnrad (⚙) und die Vollansicht, um seine Häufigkeit einzustellen.</span></div>`;
  }
  if(rare.length){
    html += `<details style="margin-top:8px;">
      <summary class="small-muted" style="cursor:pointer;">▸ selten — ${rare.length} weitere Felder</summary>
      <div class="panel" style="margin-top:8px;">${rare.map(({section,f,fIdx})=>renderFieldRow(section,f,fIdx,false)).join('<div style="height:8px;"></div>')}</div>
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
