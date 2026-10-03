// Orakel tab: dice, random tables, combos (logic + views).
// ---- Dice ----
function handleQuickDie(sides){ pushLog(`W${sides}: ${rollDie(sides)}`, 'oracle'); render(); }
function handleFormula(ctx){
  ctx = ctx || 'oracle';
  const formula = ctx==='battle' ? ui.formulaBattle : ui.formulaOracle;
  const parsed = parseFormula(formula);
  if(!parsed){ pushLog(`Ungültige Eingabe: "${formula}" (Beispiel: 2W6+1)`, ctx); render(); return; }
  const rolls = Array.from({length:parsed.count}, ()=>rollDie(parsed.sides));
  const sum = rolls.reduce((a,b)=>a+b,0)+parsed.mod;
  const modText = parsed.mod ? (parsed.mod>0?` +${parsed.mod}`:` ${parsed.mod}`) : '';
  pushLog(`${formula}: [${rolls.join(', ')}]${modText} = ${sum}`, ctx);
  render();
}
function onFormulaInput(el, ctx){ if(ctx==='battle') ui.formulaBattle = el.value; else ui.formulaOracle = el.value; }
function onFormulaKeydown(e, ctx){ if(e.key==='Enter') handleFormula(ctx); }
function clearLogConfirm(ctx){ ui.confirmClear[ctx||'oracle']=true; render(); }
function clearLogCancel(ctx){ ui.confirmClear[ctx||'oracle']=false; render(); }
function clearLog(ctx){
  ctx = ctx || 'oracle';
  const field = ctx==='battle' ? 'battleLog' : 'log';
  updateActive(camp=>({...camp, [field]:[]}));
  ui.confirmClear[ctx]=false; saveState(); render();
}

// ---- Tables ----
const tableNameIndexCache = new WeakMap();
function findTableByName(name){
  const active = getActive();
  let idx = tableNameIndexCache.get(active);
  if(!idx){
    idx = new Map();
    active.tables.forEach(t=>{ const k = t.name.trim().toLowerCase(); if(!idx.has(k)) idx.set(k, t); });
    tableNameIndexCache.set(active, idx);
  }
  return idx.get(name.trim().toLowerCase());
}
function pickEntry(entries, distMode, formula){
  if(!entries.length) return {entry:null, rollInfo:''};
  if(distMode==='dist'){
    const parsed = parseFormula(formula);
    if(!parsed) return {entry: entries[Math.floor(Math.random()*entries.length)], rollInfo:''};
    const rolls = Array.from({length:parsed.count}, ()=>rollDie(parsed.sides));
    const sum = rolls.reduce((a,b)=>a+b,0) + parsed.mod;
    const match = entries.find(e=>e.range && sum>=e.range.min && sum<=e.range.max);
    return {entry: match || null, rollInfo: ` [${formula}: ${sum}]`};
  }
  return {entry: entries[Math.floor(Math.random()*entries.length)], rollInfo:''};
}
// {{…}} can be nested; the innermost ones are resolved first, so
// {{Attack {{Tomb|Tower}}|Find {{Ring|Skull}}}} works.
function resolveInlineRefs(text, depth, visited){
  if(!text) return text;
  const re = /\{\{([^{}]+)\}\}/g;
  let out = text;
  for(let pass=0; pass<20 && /\{\{[^{}]+\}\}/.test(out); pass++){
    out = out.replace(re, (whole, name)=>resolveInlineRef(name, depth, visited));
  }
  return out;
}
function resolveInlineRef(name, depth, visited){
  if(depth>5) return '[zu tief verschachtelt]';
  // {{75%}} → roll d100 against it: "75% [W100: 23 ✔]"
  const pct = name.trim().match(/^(\d{1,3})\s*%$/);
  if(pct){
    const roll = rollDie(100);
    return `${pct[1]}% [W100: ${roll} ${roll<=parseInt(pct[1],10) ? '✔' : '✘'}]`;
  }
  // {{2d6}} → "2d6→7" (unless a table has that name)
  const diceF = !findTableByName(name) && parseFormula(name.trim());
  if(diceF){
    let sum = diceF.mod;
    for(let i=0;i<diceF.count;i++) sum += rollDie(diceF.sides);
    return `${name.trim()}→${sum}`;
  }
  // {{@terrain: ANIMAL}} → "<table for the current terrain>: ANIMAL".
  // {{@terrain: ANIMAL | Forest}} uses Forest when no terrain is known.
  const tm = name.trim().match(/^@(?:terrain|gelände)\s*:\s*([^|]+?)\s*(?:\|\s*(.+))?$/i);
  if(tm){
    const cat = tm[1].trim(), fallback = (tm[2]||'').trim();
    const ctx = currentTerrainContext();
    const prefixes = terrainTablePrefixes(ctx);
    if(!prefixes.length && fallback) prefixes.push(fallback);
    if(!prefixes.length) return `${cat} [Gelände unbekannt — 📍 Marker auf ein Karten-Feld mit Gelände setzen oder im Orakel ein Gelände wählen]`;
    const prefix = prefixes.find(p=>findTableByName(`${p}: ${cat}`));
    if(!prefix) return `${cat} [keine Tabelle „${prefixes[0]}: ${cat}“]`;
    const table = findTableByName(`${prefix}: ${cat}`);
    if(visited.has(table.id)) return '[Zirkelverweis]';
    const nextVisited = new Set(visited);
    nextVisited.add(table.id);
    return `${cat} (${prefix}) → ${rollTableCore(table, depth+1, nextVisited).text}`;
  }
  // {{Tomb|Tower|Palace}} → one of them, picked at random (unless a table has that name)
  if(name.includes('|') && !findTableByName(name)){
    const parts = name.split('|').map(p=>p.trim());
    return parts[Math.floor(Math.random()*parts.length)];
  }
  const table = findTableByName(name.trim());
  if(!table) return `[${name.trim()} nicht gefunden]`;
  if(visited.has(table.id)) return '[Zirkelverweis]';
  const nextVisited = new Set(visited);
  nextVisited.add(table.id);
  const core = rollTableCore(table, depth+1, nextVisited);
  return core.text;
}
function rollTableCore(table, depth, visited){
  return table.mode==='aspects' ? rollAspectsCore(table, depth, visited) : rollListCore(table, depth, visited);
}
function rollListCore(table, depth, visited){
  const {entry, rollInfo} = pickEntry(table.entries, table.distMode, table.formula);
  if(!entry) return {text:`(kein Eintrag${rollInfo})`, blockLines:[], rollInfo:''};
  const nextVisited = new Set(visited);
  nextVisited.add(table.id);
  const resolvedText = resolveInlineRefs(entry.text, depth, nextVisited);
  const blockLines = [];
  (entry.links||[]).forEach(name=>{
    const linked = findTableByName(name);
    if(!linked){ blockLines.push(`↳ "${name}" nicht gefunden`); return; }
    if(nextVisited.has(linked.id)){ blockLines.push('↳ Zirkelverweis übersprungen'); return; }
    if(depth>5){ blockLines.push('↳ zu tief verschachtelt'); return; }
    const subFull = rollTableFull(linked, depth+1, nextVisited);
    blockLines.push(subFull.split('\n').map(l=>'  ↳ '+l).join('\n'));
  });
  return {text: resolvedText, blockLines, rollInfo};
}
function rollAspectsCore(table, depth, visited){
  if(!table.aspects || !table.aspects.length) return {text:'(keine Aspekte)', blockLines:[], rollInfo:''};
  const nextVisited = new Set(visited);
  nextVisited.add(table.id);
  const lines = [];
  table.aspects.forEach(a=>{
    const {entry, rollInfo} = pickEntry(a.options, a.distMode, a.formula);
    if(!entry){ lines.push(`${a.name}: (kein Eintrag${rollInfo})`); return; }
    const resolvedText = resolveInlineRefs(entry.text, depth, nextVisited);
    const dispLines = resolvedText.split('\n');
    lines.push(`${a.name}: ${dispLines[0]}${rollInfo}`);
    dispLines.slice(1).forEach(l=>lines.push(`  ${l}`));
    (entry.links||[]).forEach(name=>{
      const linked = findTableByName(name);
      if(!linked){ lines.push(`  ↳ "${name}" nicht gefunden`); return; }
      if(nextVisited.has(linked.id) || depth>5){ lines.push('  ↳ übersprungen'); return; }
      const subFull = rollTableFull(linked, depth+1, nextVisited);
      lines.push(subFull.split('\n').map(l=>'    ↳ '+l).join('\n'));
    });
  });
  return {text: lines.join('\n'), blockLines: [], rollInfo:''};
}
function rollTableFull(table, depth, visited){
  const core = rollTableCore(table, depth, visited);
  if(table.mode==='aspects'){
    return [`${table.name}:`, ...core.text.split('\n').map(l=>'  '+l)].join('\n');
  }
  const dispLines = core.text.split('\n');
  const lines = [`${table.name}: ${dispLines[0]}${core.rollInfo||''}`];
  dispLines.slice(1).forEach(l=>lines.push(`  ${l}`));
  core.blockLines.forEach(l=>lines.push(l));
  return lines.join('\n');
}
function rollOneEntry(table){ return rollTableFull(table, 0, new Set()); }
function handleRollTable(id){
  const t = getActive().tables.find(t=>t.id===id);
  if(t) pushLog(rollOneEntry(t));
  render();
}
function startNewTable(){
  ui.editingTableId='new';
  ui.tableDraft={name:'', group:'', mode:'list', distMode:'equal', formula:'', entries:[], aspectsDraft:[]};
  render();
}
function cloneEntry(e){ return {id:e.id||uid(), text:e.text||'', range: e.range?{...e.range}:null, links:[...(e.links||[])]}; }
function startEditTable(id){
  const t = getActive().tables.find(t=>t.id===id);
  ui.editingTableId=id;
  ui.tableDraft={
    name:t.name, group:t.group||'', mode:t.mode||'list',
    distMode:t.distMode||'equal', formula:t.formula||'',
    entries:(t.entries||[]).map(cloneEntry),
    aspectsDraft:(t.aspects||[]).map(a=>({
      id:a.id||uid(), name:a.name, distMode:a.distMode||'equal', formula:a.formula||'',
      options:(a.options||[]).map(cloneEntry),
    })),
  };
  render();
}
function cancelEditTable(){ ui.editingTableId=null; render(); }
function onTableDraftName(el){ ui.tableDraft.name = el.value; }
function onTableDraftGroup(el){ ui.tableDraft.group = el.value; }
function setTableMode(mode){ ui.tableDraft.mode = mode; render(); }
function setTableDistMode(mode){ ui.tableDraft.distMode = mode; render(); }
function onTableFormula(el){ ui.tableDraft.formula = el.value; }
function addAspectDraft(){ ui.tableDraft.aspectsDraft.push({id:uid(), name:'', distMode:'equal', formula:'', options:[]}); render(); }
function removeAspectDraft(id){ ui.tableDraft.aspectsDraft = ui.tableDraft.aspectsDraft.filter(a=>a.id!==id); render(); }
function onAspectDraftName(id, el){ ui.tableDraft.aspectsDraft.find(a=>a.id===id).name = el.value; }
function setAspectDistMode(id, mode){ ui.tableDraft.aspectsDraft.find(a=>a.id===id).distMode = mode; render(); }
function onAspectFormula(id, el){ ui.tableDraft.aspectsDraft.find(a=>a.id===id).formula = el.value; }

function getDraftEntries(aspectId){
  if(!aspectId) return ui.tableDraft.entries;
  return ui.tableDraft.aspectsDraft.find(a=>a.id===aspectId).options;
}
function addDraftEntry(aspectId){
  getDraftEntries(aspectId).push({id:uid(), text:'', range:null, links:[]});
  render();
}
function removeDraftEntry(aspectId, entryId){
  const arr = getDraftEntries(aspectId);
  const idx = arr.findIndex(e=>e.id===entryId);
  if(idx>=0) arr.splice(idx,1);
  render();
}
function onDraftEntryText(aspectId, entryId, el){
  getDraftEntries(aspectId).find(e=>e.id===entryId).text = el.value;
}
function onDraftEntryLinks(aspectId, entryId, el){
  getDraftEntries(aspectId).find(e=>e.id===entryId).links = el.value.split(',').map(s=>s.trim()).filter(Boolean);
}
function onDraftEntryRangeMin(aspectId, entryId, el){
  const e = getDraftEntries(aspectId).find(e=>e.id===entryId);
  if(!e.range) e.range = {min:0,max:0};
  e.range.min = parseInt(el.value,10) || 0;
}
function onDraftEntryRangeMax(aspectId, entryId, el){
  const e = getDraftEntries(aspectId).find(e=>e.id===entryId);
  if(!e.range) e.range = {min:0,max:0};
  e.range.max = parseInt(el.value,10) || 0;
}

function saveTable(){
  const name = ui.tableDraft.name.trim() || 'Unbenannte Tabelle';
  const group = (ui.tableDraft.group||'').trim();
  const mode = ui.tableDraft.mode;
  let payload;
  if(mode==='aspects'){
    const aspects = ui.tableDraft.aspectsDraft.map(a=>({
      id:a.id, name:a.name.trim()||'Aspekt', distMode:a.distMode, formula:a.formula,
      options:a.options.filter(e=>e.text.trim()),
    }));
    payload = {name, group, mode, entries:[], aspects, distMode:'equal', formula:''};
  } else {
    payload = {
      name, group, mode, distMode:ui.tableDraft.distMode, formula:ui.tableDraft.formula,
      entries:ui.tableDraft.entries.filter(e=>e.text.trim()), aspects:[],
    };
  }
  updateActive(camp=>{
    const tables = [...camp.tables];
    if(ui.editingTableId==='new'){ tables.push(Object.assign({id:uid()}, payload)); }
    else{ const idx = tables.findIndex(t=>t.id===ui.editingTableId); tables[idx] = Object.assign({}, tables[idx], payload); }
    return {...camp, tables};
  });
  ui.editingTableId=null; saveState(); render();
}
function deleteTable(id){
  updateActive(camp=>({
    ...camp,
    tables: camp.tables.filter(t=>t.id!==id),
    combos: camp.combos.map(c=>({...c, tableIds:c.tableIds.filter(tid=>tid!==id)})),
  }));
  ui.editingTableId=null; saveState(); render();
}
function moveTable(id, dir){
  updateActive(camp=>{
    const arr = [...camp.tables];
    const idx = arr.findIndex(t=>t.id===id);
    if(idx===-1) return camp;
    const group = arr[idx].group||'';
    const groupIdxs = arr.map((t,i)=>({t,i})).filter(o=>(o.t.group||'')===group).map(o=>o.i);
    const posInGroup = groupIdxs.indexOf(idx);
    const newPosInGroup = posInGroup + dir;
    if(newPosInGroup<0 || newPosInGroup>=groupIdxs.length) return camp;
    const i1 = groupIdxs[posInGroup], i2 = groupIdxs[newPosInGroup];
    [arr[i1], arr[i2]] = [arr[i2], arr[i1]];
    return {...camp, tables:arr};
  });
  saveState(); render();
}
function toggleTableGroup(name){
  updateActive(camp=>{
    const collapsed = Object.assign({}, camp.collapsedGroups);
    collapsed[name] = !collapsed[name];
    return {...camp, collapsedGroups:collapsed};
  });
  saveState(); render();
}
function moveGroup(name, dir){
  updateActive(camp=>{
    const order = [...camp.groupOrder];
    const idx = order.indexOf(name);
    const newIdx = idx+dir;
    if(idx===-1 || newIdx<0 || newIdx>=order.length) return camp;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    return {...camp, groupOrder:order};
  });
  saveState(); render();
}
function toggleTableSelectMode(){
  ui.tableSelectMode = !ui.tableSelectMode;
  if(!ui.tableSelectMode){ ui.selectedTableIds=[]; ui.confirmBulkDeleteTables=false; }
  render();
}
function toggleTableSelected(id){
  const i = ui.selectedTableIds.indexOf(id);
  if(i>=0) ui.selectedTableIds.splice(i,1); else ui.selectedTableIds.push(id);
  render();
}
function confirmDeleteSelectedTables(){ ui.confirmBulkDeleteTables=true; render(); }
function cancelDeleteSelectedTables(){ ui.confirmBulkDeleteTables=false; render(); }
// Select / deselect every table of a group at once (select mode).
function toggleGroupSelected(group){
  const ids = getActive().tables.filter(t=>t.group===group).map(t=>t.id);
  const allSelected = ids.every(id=>ui.selectedTableIds.includes(id));
  ui.selectedTableIds = allSelected
    ? ui.selectedTableIds.filter(id=>!ids.includes(id))
    : [...new Set([...ui.selectedTableIds, ...ids])];
  render();
}
// Delete a whole group (manage mode), with an inline confirmation.
function askDeleteTableGroup(group){ ui.confirmDeleteTableGroup = group; render(); }
function cancelDeleteTableGroup(){ ui.confirmDeleteTableGroup = null; render(); }
function deleteTableGroup(group){
  backupNow('Vor Löschen der Tabellengruppe „'+group+'“');
  const ids = new Set(getActive().tables.filter(t=>t.group===group).map(t=>t.id));
  updateActive(camp=>({
    ...camp,
    tables: camp.tables.filter(t=>!ids.has(t.id)),
    combos: camp.combos.map(c=>({...c, tableIds:c.tableIds.filter(tid=>!ids.has(tid))})),
    groupOrder: camp.groupOrder.filter(g=>g!==group),
  }));
  ui.confirmDeleteTableGroup = null;
  ui.selectedTableIds = ui.selectedTableIds.filter(id=>!ids.has(id));
  saveState(); render();
}
function deleteSelectedTables(){
  backupNow('Vor Löschen von '+ui.selectedTableIds.length+' Tabellen');
  const ids = new Set(ui.selectedTableIds);
  updateActive(camp=>({
    ...camp,
    tables: camp.tables.filter(t=>!ids.has(t.id)),
    combos: camp.combos.map(c=>({...c, tableIds:c.tableIds.filter(tid=>!ids.has(tid))})),
  }));
  ui.selectedTableIds=[]; ui.confirmBulkDeleteTables=false; ui.tableSelectMode=false;
  saveState(); render();
}
function onBulkGroupSelect(el){ ui.bulkGroupChoice = el.value; render(); }
function onBulkGroupNewInput(el){ ui.bulkGroupNewName = el.value; }
function applyBulkGroup(){
  const ids = new Set(ui.selectedTableIds);
  const group = ui.bulkGroupChoice==='__new__' ? (ui.bulkGroupNewName||'').trim() : (ui.bulkGroupChoice||'');
  updateActive(camp=>{
    const tables = camp.tables.map(t=> ids.has(t.id) ? {...t, group} : t);
    const groupOrder = [...camp.groupOrder];
    if(group && !groupOrder.includes(group)) groupOrder.push(group);
    return {...camp, tables, groupOrder};
  });
  ui.selectedTableIds=[]; ui.tableSelectMode=false; ui.bulkGroupChoice=''; ui.bulkGroupNewName='';
  saveState(); render();
}
function startImport(){ ui.importText=''; ui.showImport=true; render(); }
function cancelImport(){ ui.showImport=false; render(); }
function onImportTextInput(el){ ui.importText = el.value; }
// Merges imported Kartei entries into an existing entry list. An entry counts
// as "the same" when title (case-insensitive) and parent match — its notes are
// refreshed from the file but play state (resolved/collapsed) is kept, so
// re-importing a file updates instead of duplicating. The file's parentId
// links are remapped to app ids; since the UI shows one nesting level only,
// deeper entries hang on their top-level ancestor.
function mergeKarteiEntries(existing, imported){
  const result = existing.map(e=>({...e}));
  const byId = {}; result.forEach(e=>{ byId[e.id]=e; });
  const byFileId = {}; imported.forEach(e=>{ byFileId[e.fileId]=e; });
  const keyOf = (title, parentId) => (parentId||'') + '|' + String(title).trim().toLowerCase();
  const index = {}; result.forEach(e=>{ index[keyOf(e.title, e.parentId)] = e; });
  const claimed = new Set();
  const appIdByFileId = {};
  function resolve(fe, visiting){
    if(appIdByFileId[fe.fileId]) return appIdByFileId[fe.fileId];
    visiting.add(fe.fileId);
    let parentId = null;
    const pfe = fe.parentFileId ? byFileId[fe.parentFileId] : null;
    if(pfe && !visiting.has(pfe.fileId)){
      parentId = resolve(pfe, visiting);
      const parent = byId[parentId];
      if(parent && parent.parentId) parentId = parent.parentId;
    }
    const key = keyOf(fe.title, parentId);
    let entry = index[key];
    if(entry && !claimed.has(entry.id)){
      entry.title = fe.title; entry.notes = fe.notes;
    } else {
      entry = {id:uid(), title:fe.title, notes:fe.notes, resolved:fe.resolved, parentId, collapsed:false};
      result.push(entry); byId[entry.id] = entry;
      if(!index[key]) index[key] = entry;
    }
    claimed.add(entry.id);
    appIdByFileId[fe.fileId] = entry.id;
    return entry.id;
  }
  imported.forEach(fe=>resolve(fe, new Set()));
  return result;
}
function runImport(){
  const result = parseJSONImport(ui.importText);
  if(result.error){ alert(result.error); return; }
  if(!result.tables.length && !result.karteien.length && !result.characters.length) return;
  backupNow('Vor Tabellen-Import');
  updateActive(camp=>{
    const tables = [...camp.tables];
    result.tables.forEach(({name, group, mode, distMode, formula, entries, aspects})=>{
      group = (group||'').trim();
      const idx = tables.findIndex(t=>t.name.trim().toLowerCase()===name.trim().toLowerCase());
      if(idx>=0) tables[idx] = Object.assign({}, tables[idx], {name, group, mode, distMode, formula, entries, aspects});
      else tables.push({id:uid(), name, group, mode, distMode, formula, entries, aspects});
    });
    const karteien = [...camp.karteien];
    const tabOrder = [...camp.tabOrder];
    result.karteien.forEach(({name, icon, hasCheckbox, entries})=>{
      const idx = karteien.findIndex(k=>k.name.trim().toLowerCase()===name.trim().toLowerCase());
      const existingEntries = idx>=0 ? karteien[idx].entries : [];
      const merged = mergeKarteiEntries(existingEntries, entries);
      if(idx>=0){
        karteien[idx] = {...karteien[idx], entries: merged};
      } else {
        const newKartei = {id:uid(), name, icon, hasCheckbox, entries: merged};
        karteien.push(newKartei);
        tabOrder.push(newKartei.id);
      }
    });
    let characters = [...camp.characters];
    let activeCharacterId = camp.activeCharacterId;
    result.characters.forEach(({name, sections})=>{
      const idx = characters.findIndex(c=>c.name.trim().toLowerCase()===name.trim().toLowerCase());
      const newSections = sections.map(s=>({
        id: uid(), name: s.name, sb: s.sb, sbAbbr: s.sbAbbr, quick: s.quick,
        fields: s.fields.map(f=>({id:uid(), name:f.name, type:f.type, value:f.value, tier: f.tier || (f.type==='counter' || f.type==='spells' ? 'surface' : 'rare'), sb: f.sb, sbAbbr: f.sbAbbr, sbCols: f.sbCols})),
      }));
      if(idx>=0){
        const existing = characters[idx];
        const mergedSections = [...existing.sections];
        newSections.forEach(ns=>{
          const sidx = mergedSections.findIndex(es=>es.name.trim().toLowerCase()===ns.name.trim().toLowerCase());
          if(sidx>=0) mergedSections[sidx] = ns;
          else mergedSections.push(ns);
        });
        characters[idx] = {...existing, sections: mergedSections};
      } else {
        const newChar = {id:uid(), name, sections:newSections};
        characters.push(newChar);
        if(!activeCharacterId) activeCharacterId = newChar.id;
      }
    });
    return {...camp, tables, karteien, tabOrder, characters, activeCharacterId};
  });
  ui.showImport=false; saveState(); render();
}

// ---- Combos ----
function handleRollCombo(id){
  const combo = getActive().combos.find(c=>c.id===id);
  const included = combo.tableIds.map(tid=>getActive().tables.find(t=>t.id===tid)).filter(Boolean);
  if(!included.length){ pushLog(`${combo.name}: (keine Tabellen ausgewählt — Kombi bearbeiten)`); render(); return; }
  pushLog(`${combo.name}:\n${included.map(rollOneEntry).join('\n')}`);
  render();
}
function startNewCombo(){ ui.editingComboId='new'; ui.comboDraft={name:'', tableIds:[]}; render(); }
function startEditCombo(id){
  const c = getActive().combos.find(c=>c.id===id);
  ui.editingComboId=id; ui.comboDraft={name:c.name, tableIds:[...c.tableIds]};
  render();
}
function cancelEditCombo(){ ui.editingComboId=null; render(); }
function onComboDraftName(el){ ui.comboDraft.name = el.value; }
function toggleComboTable(tid){
  const idx = ui.comboDraft.tableIds.indexOf(tid);
  if(idx>=0) ui.comboDraft.tableIds.splice(idx,1); else ui.comboDraft.tableIds.push(tid);
  render();
}
function saveCombo(){
  const name = ui.comboDraft.name.trim() || 'Unbenannte Kombi';
  updateActive(camp=>{
    const combos = [...camp.combos];
    if(ui.editingComboId==='new'){ combos.push({id:uid(), name, tableIds:ui.comboDraft.tableIds}); }
    else{ const idx = combos.findIndex(c=>c.id===ui.editingComboId); combos[idx] = {...combos[idx], name, tableIds:ui.comboDraft.tableIds}; }
    return {...camp, combos};
  });
  ui.editingComboId=null; saveState(); render();
}
function deleteCombo(id){
  updateActive(camp=>({...camp, combos: camp.combos.filter(c=>c.id!==id)}));
  ui.editingComboId=null; saveState(); render();
}

function renderResultsPanel(spanClass, ctx){
  ctx = ctx || 'oracle';
  const active = getActive();
  const log = ctx==='battle' ? active.battleLog : active.log;
  let logHtml;
  if(log.length===0){
    logHtml = `<p class="small-muted" style="text-align:center;padding:12px 0;">Noch nichts gewürfelt. Ergebnisse erscheinen hier, neuestes zuerst.</p>`;
  } else {
    logHtml = `<div id="results-log-scroll-${ctx}" style="display:flex;flex-direction:column;gap:2px;max-height:256px;overflow-y:auto;">`
      + log.map((entry, idx)=>{
          const isLatest = idx === 0;
          return `<div class="log-entry ${isLatest?'latest':''}">
            <span class="log-time">${entry.time}</span>
            <span class="log-text">${escapeHtml(entry.text)}</span>
          </div>`;
        }).join('')
      + `</div>`;
  }
  const clearControls = log.length>0
    ? (ui.confirmClear[ctx]
        ? `<div class="row" style="gap:6px;">
             <button class="btn" style="background:var(--wax);color:var(--text);padding:4px 8px;font-size:12px;" onclick="clearLog('${ctx}')">Leeren</button>
             <button class="btn" style="background:var(--panel-raised);color:var(--text-muted);padding:4px 8px;font-size:12px;" onclick="clearLogCancel('${ctx}')">Abbrechen</button>
           </div>`
        : `<button class="icon-btn" onclick="clearLogConfirm('${ctx}')" title="Verlauf leeren">↺</button>`)
    : '';
  return `<div class="panel ${spanClass||''}">
    <div class="row between"><span class="label">Ergebnisse</span>${clearControls}</div>
    ${logHtml}
  </div>`;
}

function handleOracleRoll(id, ctx){
  ctx = ctx || 'oracle';
  const active = getActive();
  const dice = ctx==='battle' ? active.battleDice : active.oracleDice;
  const die = dice.find(d=>d.id===id);
  if(!die) return;
  const parsed = parseFormula(die.formula);
  if(!parsed){ pushLog(`${die.name}: ungültige Formel "${die.formula}"`, ctx); render(); return; }
  const rolls = Array.from({length:parsed.count}, ()=>rollDie(parsed.sides));
  const sum = rolls.reduce((a,b)=>a+b,0) + parsed.mod;
  const modText = parsed.mod ? (parsed.mod>0?` +${parsed.mod}`:` ${parsed.mod}`) : '';
  pushLog(`${die.name}: [${rolls.join(', ')}]${modText} = ${sum}`, ctx);
  render();
}
function renderDiceRollerPanel(ctx){
  ctx = ctx || 'oracle';
  const active = getActive();
  const dice = ctx==='battle' ? active.battleDice : active.oracleDice;
  const formulaVal = ctx==='battle' ? ui.formulaBattle : ui.formulaOracle;
  return `<div class="panel">
    <span class="label">Würfeln</span>
    <div class="grid-dice">
      ${dice.map(d=>`<button class="die-btn" onclick="handleOracleRoll('${d.id}','${ctx}')">${escapeHtml(d.name)}</button>`).join('')}
    </div>
    <div class="row">
      <input type="text" value="${escapeHtml(formulaVal)}" placeholder="z.B. 2W6+1" oninput="onFormulaInput(this,'${ctx}')" onkeydown="onFormulaKeydown(event,'${ctx}')" style="flex:1;">
      <button class="btn btn-gold" onclick="handleFormula('${ctx}')">Würfeln</button>
    </div>
  </div>`;
}

// ---- Position (terrain for {{@terrain: …}} tables, area encounter) ----
function setTerrainOverride(v){
  updateActive(camp=>({...camp, terrainOverride: v || null}));
  saveState(); render();
}
function findAreaTable(node){
  return getActive().areasEnabled && node && node.area ? findTableByName(node.area) : null;
}
function rollAreaEncounter(){
  // The area always comes from the 📍 hex, even if the terrain is overridden.
  const ctx = currentTerrainContext(true);
  const table = findAreaTable(ctx && ctx.node);
  if(!table) return;
  handleRollTable(table.id);
}
// Does any table use {{@terrain: …}}? Cached per campaign state.
const terrainRefCache = new WeakMap();
function tablesUseTerrainRefs(active){
  if(!terrainRefCache.has(active)){
    terrainRefCache.set(active, active.tables.some(t=>
      (t.entries||[]).some(e=>(e.text||'').includes('{{@terrain')) ||
      (t.aspects||[]).some(a=>(a.options||[]).some(e=>(e.text||'').includes('{{@terrain')))));
  }
  return terrainRefCache.get(active);
}
// Only shown when it matters: some table uses {{@terrain: …}}, or the 📍 hex
// has an area to roll. Nothing location-dependent otherwise.
function renderPositionPanel(){
  const active = getActive();
  const ov = active.terrainOverride || '';
  const mapCtx = currentTerrainContext(true);
  const usesTerrain = tablesUseTerrainRefs(active);
  if(!usesTerrain && !findAreaTable(mapCtx && mapCtx.node)) return '';
  const autoLabel = mapCtx && mapCtx.node
    ? `Karte: Feld ${mapCtx.node.num}${terrainContextLabel(mapCtx) ? ' · '+terrainContextLabel(mapCtx) : ' · (kein Gelände)'}`
    : 'Karte: kein 📍 Marker gesetzt';
  const opt = (v, label) => `<option value="${v}" ${ov===v?'selected':''}>${escapeHtml(label)}</option>`;
  const options = opt('', 'Automatisch — '+autoLabel)
    + opt('__fixed', 'Aus — feste Gelände der Tabellen (nicht ortsabhängig)')
    + `<optgroup label="Gelände">${TERRAINS.map(t=>opt(t.id, t.label)).join('')}</optgroup>`
    + `<optgroup label="Siedlung">${SETTLEMENTS.map(s=>opt(s.id, s.label)+opt(s.id+':coastal', s.label+' (Coastal)')+opt(s.id+':desert', s.label+' (Desert)')).join('')}</optgroup>`;
  const areaTable = findAreaTable(mapCtx && mapCtx.node);
  return `<div class="panel">
    <span class="label">🧭 Position</span>
    ${usesTerrain ? `<select onchange="setTerrainOverride(this.value)" style="width:100%;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:14px;">${options}</select>` : ''}
    ${areaTable
      ? `<button class="btn btn-gold" onclick="rollAreaEncounter()">🎲 Begegnung: ${escapeHtml(areaTable.name)}</button>`
      : `<p class="small-muted" style="margin:0;">Tabellen mit <code style="color:var(--gold);">{{@terrain: ANIMAL}}</code> würfeln auf der Tabelle dieses Geländes.${active.areasEnabled ? ' Gibst du dem Marker-Feld ein Gebiet (Karte → Feld bearbeiten), erscheint hier ein Begegnungs-Knopf.' : ''}</p>`}
  </div>`;
}
function renderDiceTab(){
  const active = getActive();
  let html = `<div class="grid-cards">`;
  html += renderResultsPanel('span-all', 'oracle');
  html += renderDiceRollerPanel('oracle');
  html += renderPositionPanel();

  html += `<div class="panel"><div class="row between"><span class="label">Tabellen</span>
    ${ui.managing ? `<div class="row" style="gap:6px;">
      <button class="btn ${ui.tableSelectMode?'btn-gold':'btn-raised'}" style="padding:4px 8px;font-size:12px;" onclick="toggleTableSelectMode()">${ui.tableSelectMode?'✕ Auswahl beenden':'☑ Auswählen'}</button>
      <button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="startImport()">Import</button>
      <button class="btn btn-gold" style="padding:4px 8px;font-size:12px;" onclick="startNewTable()">+ Neu</button>
    </div>` : ''}</div>`;
  if(active.tables.length===0){
    html += `<div class="empty"><span>Noch keine Tabellen angelegt.</span>
      <button class="btn btn-raised" onclick="startNewTable()">+ Erste Tabelle anlegen</button></div>`;
  } else {
    if(ui.tableSelectMode && ui.selectedTableIds.length>0){
      html += `<div class="panel" style="background:var(--panel-raised);gap:8px;">
        <span class="small-muted">${ui.selectedTableIds.length} ausgewählt</span>
        <div class="row wrap" style="gap:8px;align-items:center;">
          <select onchange="onBulkGroupSelect(this)" style="flex:1;">
            <option value="" ${!ui.bulkGroupChoice?'selected':''}>Gruppe entfernen</option>
            ${active.groupOrder.map(g=>`<option value="${escapeHtml(g)}" ${ui.bulkGroupChoice===g?'selected':''}>${escapeHtml(g)}</option>`).join('')}
            <option value="__new__" ${ui.bulkGroupChoice==='__new__'?'selected':''}>+ Neue Gruppe…</option>
          </select>
          ${ui.bulkGroupChoice==='__new__' ? `<input type="text" placeholder="Name der neuen Gruppe" value="${escapeHtml(ui.bulkGroupNewName||'')}" oninput="onBulkGroupNewInput(this)" style="flex:1;">` : ''}
          <button class="btn btn-gold" style="padding:6px 10px;font-size:12px;" onclick="applyBulkGroup()">→ Verschieben</button>
        </div>
        <div class="row" style="gap:8px;">
          ${ui.confirmBulkDeleteTables ? `
            <button class="btn" style="background:var(--wax);color:var(--text);padding:6px 10px;font-size:12px;" onclick="deleteSelectedTables()">Wirklich löschen (${ui.selectedTableIds.length})</button>
            <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="cancelDeleteSelectedTables()">Abbrechen</button>
          ` : `<button class="btn btn-outline-wax" style="padding:6px 10px;font-size:12px;" onclick="confirmDeleteSelectedTables()">🗑 Ausgewählte löschen</button>`}
        </div>
      </div>`;
    }
    const renderTableRow = (t, idxInGroup, groupLen) => {
      const selected = ui.selectedTableIds.includes(t.id);
      return `
      <div class="row" style="gap:8px;">
        ${ui.tableSelectMode ? `<input type="checkbox" ${selected?'checked':''} onchange="toggleTableSelected('${t.id}')" style="width:20px;height:20px;flex-shrink:0;">` : ''}
        <button class="table-row row between" style="flex:1;color:var(--text);text-align:left;${selected?'border-color:var(--gold);background:var(--gold-dim);':''}" onclick="${ui.tableSelectMode?`toggleTableSelected('${t.id}')`:`handleRollTable('${t.id}')`}">
          <span>${escapeHtml(t.name)}</span><span class="small-muted" style="font-family:ui-monospace,monospace;">${t.mode==='aspects' ? `${(t.aspects||[]).length} Aspekte` : `${t.entries.length} Einträge`}</span>
        </button>
        ${(ui.managing && !ui.tableSelectMode) ? `<button class="icon-btn raised" style="${idxInGroup===0?'opacity:0.3;':''}" ${idxInGroup===0?'disabled':''} onclick="moveTable('${t.id}',-1)">↑</button>
        <button class="icon-btn raised" style="${idxInGroup===groupLen-1?'opacity:0.3;':''}" ${idxInGroup===groupLen-1?'disabled':''} onclick="moveTable('${t.id}',1)">↓</button>
        <button class="icon-btn raised" onclick="startEditTable('${t.id}')">✎</button>` : ''}
      </div>`;
    };
    const ungrouped = active.tables.filter(t=>!t.group);
    const groupNames = active.groupOrder.filter(g=>active.tables.some(t=>t.group===g));
    html += ungrouped.map((t,idx)=>renderTableRow(t, idx, ungrouped.length)).join('');
    html += groupNames.map((g,gIdx)=>{
      const members = active.tables.filter(t=>t.group===g);
      const collapsed = !!active.collapsedGroups[g];
      const nSel = members.filter(t=>ui.selectedTableIds.includes(t.id)).length;
      const groupCheck = ui.tableSelectMode
        ? `<input type="checkbox" ${nSel===members.length?'checked':''} title="Alle ${members.length} Tabellen dieser Gruppe auswählen" onchange="toggleGroupSelected(${jsStr(g)})" style="width:20px;height:20px;flex-shrink:0;">`
        : '';
      const confirming = ui.confirmDeleteTableGroup===g;
      return `<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">
        <div class="row between" style="gap:8px;">
          ${groupCheck}
          <button class="row" style="flex:1;background:none;border:none;color:var(--text);padding:6px 2px;cursor:pointer;gap:6px;" onclick="toggleTableGroup(${jsStr(g)})">
            <span class="label" style="color:var(--gold);">${collapsed?'▶':'▼'} ${escapeHtml(g)}</span>
            <span class="small-muted">${ui.tableSelectMode && nSel ? nSel+' / ' : ''}${members.length}</span>
          </button>
          ${ui.managing && !ui.tableSelectMode ? `<div class="row" style="gap:4px;">
            <button class="icon-btn raised" style="${gIdx===0?'opacity:0.3;':''}" ${gIdx===0?'disabled':''} onclick="moveGroup(${jsStr(g)},-1)">↑</button>
            <button class="icon-btn raised" style="${gIdx===groupNames.length-1?'opacity:0.3;':''}" ${gIdx===groupNames.length-1?'disabled':''} onclick="moveGroup(${jsStr(g)},1)">↓</button>
            <button class="icon-btn raised" style="color:var(--wax);" title="Ganze Gruppe löschen" onclick="askDeleteTableGroup(${jsStr(g)})">🗑</button>
          </div>` : ''}
        </div>
        ${confirming ? `<div class="row wrap" style="gap:6px;padding:4px 0 6px;">
          <span class="small-muted" style="flex:1;min-width:160px;">Alle ${members.length} Tabellen in „${escapeHtml(g)}“ löschen? (Vorher wird automatisch gesichert.)</span>
          <button class="btn" style="background:var(--wax);color:var(--text);padding:6px 10px;font-size:12px;" onclick="deleteTableGroup(${jsStr(g)})">Gruppe löschen</button>
          <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="cancelDeleteTableGroup()">Abbrechen</button>
        </div>` : ''}
        ${collapsed ? '' : members.map((t,idx)=>renderTableRow(t, idx, members.length)).join('')}
      </div>`;
    }).join('');
  }
  if(ui.managing && active.tables.length>0){
    html += `<p class="small-muted">Tipp: Ein Eintrag mehrfach eintragen erhöht seine Wahrscheinlichkeit (im Modus „Gleich wahrscheinlich"). <code style="color:var(--gold);">{{Tabelle}}</code> im Text setzt einen Wurf inline ein, <code style="color:var(--gold);">{{A|B|C}}</code> wählt zufällig eins davon, „Verknüpfte Tabellen" hängt einen kompletten Zusatz-Wurf an.</p>`;
  }
  html += `</div>`;

  html += `<div class="panel"><div class="row between"><span class="label">🧩 Kombinationen</span>
    ${(ui.managing && active.tables.length>0) ? `<button class="btn btn-gold" style="padding:4px 8px;font-size:12px;" onclick="startNewCombo()">+ Neu</button>` : ''}</div>`;
  if(active.tables.length===0){
    html += `<p class="small-muted" style="text-align:center;">Erst Tabellen anlegen, dann lassen sich mehrere zu einer Kombi zusammenfassen.</p>`;
  } else if(active.combos.length===0){
    html += `<div class="empty"><span>Noch keine Kombination angelegt.</span>
      <button class="btn btn-raised" onclick="startNewCombo()">+ Erste Kombi anlegen</button></div>`;
  } else {
    html += active.combos.map(c=>`
      <div class="row" style="gap:8px;">
        <button class="combo-row row between" style="flex:1;border-color:var(--gold-dim);color:var(--text);text-align:left;" onclick="handleRollCombo('${c.id}')">
          <span>${escapeHtml(c.name)}</span><span class="small-muted" style="font-family:ui-monospace,monospace;">${c.tableIds.length} Tabellen</span>
        </button>
        ${ui.managing ? `<button class="icon-btn raised" onclick="startEditCombo('${c.id}')">✎</button>` : ''}
      </div>`).join('');
  }
  html += `</div></div>`;
  return html;
}

function triggerTableImport(){ document.getElementById('file-import-tables').click(); }
function handleTableImportFile(input){
  const files = Array.from(input.files || []);
  if(!files.length) return;
  const readers = files.map(file => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const parsed = JSON.parse(reader.result);
        resolve(Array.isArray(parsed) ? parsed : [parsed]);
      }catch(e){
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsText(file);
  }));
  Promise.all(readers).then(results=>{
    const combined = [].concat(...results);
    ui.importText = JSON.stringify(combined, null, 2);
    render();
  });
  input.value = '';
}

function renderImportModal(){
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Tabellen, Karteien &amp; Charaktere importieren (JSON)</span>
      <button class="icon-btn" onclick="cancelImport()">✕</button></div>
    <p class="small-muted">Ein JSON-Array von Tabellen, Karteien und/oder Charakteren einfügen oder als Datei(en) auswählen — landen in der aktuellen Kampagne. Gibt es bereits eine Tabelle/Kartei/Charakter mit demselben Namen, werden Tabellen ersetzt, Karteien um neue Einträge ergänzt, bei Charakteren neue Bereiche hinzugefügt und gleichnamige Bereiche ersetzt. <code style="color:var(--gold);">{{Tabellenname}}</code> im Text setzt inline einen Wurf aus einer anderen Tabelle ein, <code style="color:var(--gold);">"links"</code> hängt einen kompletten Zusatz-Wurf an. Eine Kartei erkennt der Import an Einträgen mit <code style="color:var(--gold);">"title"</code>/<code style="color:var(--gold);">"notes"</code>, ein Charakter an <code style="color:var(--gold);">"sections"</code> mit <code style="color:var(--gold);">"fields"</code> (Typen: number, counter, text, list, status, table, slots; optional <code style="color:var(--gold);">"tier"</code>: surface / scene / rare für die Kurzansicht).</p>
    <button class="btn btn-raised" onclick="triggerTableImport()">📁 Datei(en) auswählen (.json)</button>
    <textarea rows="16" placeholder='[
  {
    "name": "Zufallsbegegnung",
    "mode": "list",
    "distMode": "equal",
    "entries": [
      { "text": "Goblin-Trupp", "links": ["Goblinausrüstung"] },
      { "text": "Ein Händler bietet {{Handelsware}} an." }
    ]
  },
  {
    "name": "2W6 Encounter",
    "mode": "list",
    "distMode": "dist",
    "formula": "2d6",
    "entries": [
      { "text": "Nichts passiert", "range": {"min":2,"max":6} },
      { "text": "Räuberbande", "range": {"min":10,"max":12} }
    ]
  }
]' oninput="onImportTextInput(this)" style="font-family:ui-monospace,monospace;">${escapeHtml(ui.importText)}</textarea>
    <button class="btn btn-gold" onclick="runImport()">✓ Importieren</button>
  </div></div>`;
}

function renderEntryRow(aspectId, entry, distMode){
  const aspAttr = aspectId || '';
  const rangeInputs = distMode==='dist' ? `
    <div class="row" style="gap:4px;">
      <input type="number" value="${entry.range?entry.range.min:''}" placeholder="von" oninput="onDraftEntryRangeMin('${aspAttr}','${entry.id}',this)" onchange="render()" style="width:56px;">
      <span class="small-muted">–</span>
      <input type="number" value="${entry.range?entry.range.max:''}" placeholder="bis" oninput="onDraftEntryRangeMax('${aspAttr}','${entry.id}',this)" onchange="render()" style="width:56px;">
    </div>` : '';
  return `<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;">
    <div class="row" style="align-items:flex-start;">
      ${rangeInputs}
      <textarea rows="2" placeholder="Text, ggf. mehrzeilig — {{Tabelle}} setzt inline ein" oninput="onDraftEntryText('${aspAttr}','${entry.id}',this)" style="flex:1;font-family:ui-monospace,monospace;">${escapeHtml(entry.text)}</textarea>
      <button class="x-btn" onclick="removeDraftEntry('${aspAttr}','${entry.id}')">✕</button>
    </div>
    <input type="text" value="${escapeHtml((entry.links||[]).join(', '))}" placeholder="Verknüpfte Tabellen, kommagetrennt (hängt komplette Zusatz-Würfe an)" oninput="onDraftEntryLinks('${aspAttr}','${entry.id}',this)" style="font-size:12px;">
  </div>`;
}

function renderDistControls(aspectId, distMode, formula, entries){
  const aspAttr = aspectId || '';
  const setModeFn = aspectId ? `setAspectDistMode('${aspectId}',` : `setTableDistMode(`;
  const formulaFn = aspectId ? `onAspectFormula('${aspectId}',this)` : `onTableFormula(this)`;
  let coverage = '';
  if(distMode==='dist' && formula){
    const check = checkCoverage(entries, formula);
    if(!check){
      coverage = `<p class="small-muted" style="color:var(--wax);">Ungültige Formel.</p>`;
    } else if(check.gaps.length===0 && check.dupes.length===0){
      coverage = `<p class="small-muted" style="color:var(--gold);">✓ Abdeckung vollständig (${check.range.min}–${check.range.max})</p>`;
    } else {
      const parts = [];
      if(check.gaps.length) parts.push(`Lücke bei ${check.gaps.join(', ')}`);
      if(check.dupes.length) parts.push(`Überschneidung bei ${check.dupes.join(', ')}`);
      coverage = `<p class="small-muted" style="color:var(--wax);">${parts.join(' · ')}</p>`;
    }
  }
  return `
    <div class="mode-toggle">
      <button style="background:${distMode==='equal'?'var(--gold)':'transparent'};color:${distMode==='equal'?'var(--bg)':'var(--text-muted)'};" onclick="${setModeFn}'equal')">Gleich wahrscheinlich</button>
      <button style="background:${distMode==='dist'?'var(--gold)':'transparent'};color:${distMode==='dist'?'var(--bg)':'var(--text-muted)'};" onclick="${setModeFn}'dist')">Verteilung</button>
    </div>
    ${distMode==='dist' ? `<input type="text" value="${escapeHtml(formula)}" placeholder="Würfelformel, z.B. 2W6, 3W7+1" oninput="${formulaFn}" onchange="render()">${coverage}` : ''}
  `;
}

function renderTableModal(){
  const isNew = ui.editingTableId==='new';
  const mode = ui.tableDraft.mode;
  const modeToggle = `<div class="mode-toggle">
    <button style="background:${mode==='list'?'var(--gold)':'transparent'};color:${mode==='list'?'var(--bg)':'var(--text-muted)'};" onclick="setTableMode('list')">Einfache Liste</button>
    <button style="background:${mode==='aspects'?'var(--gold)':'transparent'};color:${mode==='aspects'?'var(--bg)':'var(--text-muted)'};" onclick="setTableMode('aspects')">Mehrere Aspekte</button>
  </div>`;
  let body;
  if(mode==='list'){
    body = `<div style="display:flex;flex-direction:column;gap:8px;max-height:420px;overflow-y:auto;padding-right:2px;">
      ${renderDistControls(null, ui.tableDraft.distMode, ui.tableDraft.formula, ui.tableDraft.entries)}
      ${ui.tableDraft.entries.map(e=>renderEntryRow(null, e, ui.tableDraft.distMode)).join('')}
      <button class="btn btn-raised" onclick="addDraftEntry('')">+ Eintrag</button>
    </div>`;
  } else {
    body = `<div style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto;padding-right:2px;">
      <p class="small-muted">Jeder Aspekt wird beim Würfeln unabhängig gezogen — ein Tap liefert alle zusammen.</p>
      ${ui.tableDraft.aspectsDraft.map(a=>`
        <div style="background:var(--panel-raised);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;">
          <div class="row">
            <input type="text" value="${escapeHtml(a.name)}" placeholder="Aspekt, z.B. Wer hat das Sagen?" oninput="onAspectDraftName('${a.id}', this)" style="flex:1;">
            <button class="x-btn" onclick="removeAspectDraft('${a.id}')">✕</button>
          </div>
          ${renderDistControls(a.id, a.distMode, a.formula, a.options)}
          ${a.options.map(e=>renderEntryRow(a.id, e, a.distMode)).join('')}
          <button class="btn btn-raised" onclick="addDraftEntry('${a.id}')">+ Wert</button>
        </div>`).join('')}
      <button class="btn btn-raised" onclick="addAspectDraft()">+ Aspekt hinzufügen</button>
    </div>`;
  }
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?'Neue Tabelle':'Tabelle bearbeiten'}</span>
      <button class="icon-btn" onclick="cancelEditTable()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.tableDraft.name)}" placeholder="Name der Tabelle" oninput="onTableDraftName(this)">
    <input type="text" value="${escapeHtml(ui.tableDraft.group||'')}" placeholder="Gruppe (optional, z.B. „Hyperborea: Terrain")" oninput="onTableDraftGroup(this)" list="table-group-options">
    <datalist id="table-group-options">${[...new Set(getActive().tables.map(t=>t.group).filter(Boolean))].map(g=>`<option value="${escapeHtml(g)}">`).join('')}</datalist>
    ${modeToggle}
    ${body}
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteTable('${ui.editingTableId}')">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveTable()">✓ Speichern</button>
    </div>
  </div></div>`;
}

function renderComboModal(){
  const active = getActive();
  const isNew = ui.editingComboId==='new';
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?'Neue Kombi':'Kombi bearbeiten'}</span>
      <button class="icon-btn" onclick="cancelEditCombo()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.comboDraft.name)}" placeholder="Name der Kombination" oninput="onComboDraftName(this)">
    <span class="small-muted">Tabellen auswählen:</span>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:224px;overflow-y:auto;">
      ${active.tables.map(t=>{
        const checked = ui.comboDraft.tableIds.includes(t.id);
        return `<button class="row between" style="border-radius:10px;padding:10px 12px;background:${checked?'var(--panel-raised)':'transparent'};border:1px solid ${checked?'var(--gold)':'var(--border)'};color:var(--text);" onclick="toggleComboTable('${t.id}')">
          <span>${escapeHtml(t.name)}</span>${checked?'<span style="color:var(--gold);">✓</span>':''}
        </button>`;
      }).join('')}
    </div>
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteCombo('${ui.editingComboId}')">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveCombo()">✓ Speichern</button>
    </div>
  </div></div>`;
}
