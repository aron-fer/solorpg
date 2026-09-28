// App shell: tab setup, options, campaigns, export/import, render(), nav, header, modals.
function onSpecialTabLabel(id, el){
  updateActive(camp=>({...camp, tabOverrides: {...camp.tabOverrides, [id]: {...(camp.tabOverrides[id]||{}), label: el.value}}}));
  saveState();
}
function onSpecialTabIcon(id, el){
  updateActive(camp=>({...camp, tabOverrides: {...camp.tabOverrides, [id]: {...(camp.tabOverrides[id]||{}), icon: el.value}}}));
  saveState();
}
function moveTab(id, dir){
  updateActive(camp=>{
    const order = [...camp.tabOrder];
    const idx = order.indexOf(id);
    const newIdx = idx+dir;
    if(idx===-1 || newIdx<0 || newIdx>=order.length) return camp;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    return {...camp, tabOrder:order};
  });
  saveState(); render();
}

// ---- Oracle dice (configurable quick-roll buttons) ----
function addOracleDie(field){
  field = field || 'oracleDice';
  updateActive(camp=>({...camp, [field]:[...camp[field], {id:uid(), name:'Neu', formula:'1d20'}]}));
  saveState(); render();
}
function onOracleDieName(id, el, field){
  field = field || 'oracleDice';
  updateActive(camp=>({...camp, [field]: camp[field].map(d=>d.id===id?{...d, name:el.value}:d)}));
  saveState();
}
function onOracleDieFormula(id, el, field){
  field = field || 'oracleDice';
  updateActive(camp=>({...camp, [field]: camp[field].map(d=>d.id===id?{...d, formula:el.value}:d)}));
  saveState();
}
function deleteOracleDie(id, field){
  field = field || 'oracleDice';
  updateActive(camp=>({...camp, [field]: camp[field].filter(d=>d.id!==id)}));
  saveState(); render();
}
function moveOracleDie(id, dir, field){
  field = field || 'oracleDice';
  updateActive(camp=>{
    const arr = [...camp[field]];
    const idx = arr.findIndex(d=>d.id===id);
    const newIdx = idx+dir;
    if(idx===-1 || newIdx<0 || newIdx>=arr.length) return camp;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    return {...camp, [field]:arr};
  });
  saveState(); render();
}
function openOptions(){ ui.showOptions=true; ui.confirmRestoreBackupId=null; render(); refreshBackups(); refreshStorageInfo(); }
function closeOptions(){ ui.showOptions=false; render(); }

// ---- Campaigns ----
function openCampaignSwitcher(){ ui.showCampaignSwitcher=true; render(); }
function closeCampaignSwitcher(){ ui.showCampaignSwitcher=false; render(); }
function switchCampaign(id){ STATE.activeCampaignId=id; ui.showCampaignSwitcher=false; saveState(); render(); }
function addCampaign(){
  const newCamp = {id:uid(), name:`Kampagne ${STATE.campaigns.length+1}`};
  STATE.campaigns.push(newCamp);
  STATE.campaignData[newCamp.id] = emptyCampaignData();
  STATE.activeCampaignId = newCamp.id;
  ui.showCampaignSwitcher=false;
  saveState(); render();
}
function startRenameCampaign(id){
  const camp = STATE.campaigns.find(c=>c.id===id);
  ui.editingCampaignId=id; ui.campaignNameDraft=camp.name;
  render();
}
function onCampaignNameDraft(el){ ui.campaignNameDraft = el.value; }
function saveCampaignName(){
  STATE.campaigns = STATE.campaigns.map(c=>c.id===ui.editingCampaignId?{...c, name: ui.campaignNameDraft.trim()||'Kampagne'}:c);
  ui.editingCampaignId=null; saveState(); render();
}
function deleteCampaign(id){
  if(STATE.campaigns.length<=1) return;
  backupNow('Vor Löschen einer Kampagne');
  STATE.campaigns = STATE.campaigns.filter(c=>c.id!==id);
  delete STATE.campaignData[id];
  if(STATE.activeCampaignId===id) STATE.activeCampaignId = STATE.campaigns[0].id;
  ui.editingCampaignId=null;
  saveState(); render();
}

// ---- Export / Import ----
function exportData(){
  const activeCampaign = getActiveCampaign();
  const payload = { app:'solo-rpg', exportKind:'campaign', campaign: activeCampaign, data: getActive() };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
  const safeName = (activeCampaign?activeCampaign.name:'kampagne').replace(/[^a-z0-9]+/gi,'-').toLowerCase();
  a.href=url; a.download=`solorpg-${safeName}-${stamp}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function triggerImport(){ document.getElementById('file-import').click(); }
function handleImportFile(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if(parsed.campaigns || parsed.data) backupNow('Vor Kampagnen-Import');
      if(parsed.campaigns && parsed.campaignData){
        const idMap = {};
        const newCampaigns = parsed.campaigns.map(c=>{ const newId=uid(); idMap[c.id]=newId; return {id:newId, name:c.name}; });
        STATE.campaigns = STATE.campaigns.concat(newCampaigns);
        Object.entries(parsed.campaignData).forEach(([oldId, data])=>{
          if(idMap[oldId]) STATE.campaignData[idMap[oldId]] = data;
        });
        if(newCampaigns[0]) STATE.activeCampaignId = newCampaigns[0].id;
      } else if(parsed.data){
        const newId = uid();
        const name = (parsed.campaign && parsed.campaign.name) || 'Importierte Kampagne';
        STATE.campaigns.push({id:newId, name});
        STATE.campaignData[newId] = parsed.data;
        STATE.activeCampaignId = newId;
      } else {
        alert('Datei ist kein gültiger Solo-RPG-Export.');
        return;
      }
      saveState(); render();
      alert('Import erfolgreich.');
    }catch(e){
      alert('Import fehlgeschlagen: Datei ist kein gültiges JSON.');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ---- Rendering ----
function render(){
  document.getElementById('sidebar').innerHTML = renderNav(true);
  document.getElementById('bottomnav').innerHTML = renderNav(false);
  const active = getActive();
  const body = (active.splitView && window.innerWidth>=900) ? renderSplitView() : renderActiveTab();
  const main = document.getElementById('main');
  const html = renderHeader() + body + renderModals();
  if(!patchAroundMapPanel(main, html)){
    main.innerHTML = html;
    mountMapSvg(); // keeps the (possibly huge) map SVG between renders
    restoreZoomViews();
  }
}
// If the map panel is on screen and stays there, replace only the page parts
// around it. Taking a map with thousands of hexes out of the page and back
// makes the browser restyle all of them; leaving it in place avoids that
// (and keeps its scroll position for free). Returns false if not applicable.
function patchAroundMapPanel(main, html){
  const live = document.getElementById('map-panel');
  if(!live || live.parentNode!==main) return false;
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  const fresh = tpl.querySelector('#map-panel');
  if(!fresh || fresh.parentNode!==tpl) return false;
  const before = [], after = [];
  let seen = false;
  [...tpl.childNodes].forEach(n=>{ if(n===fresh){ seen = true; return; } (seen ? after : before).push(n); });
  [...main.childNodes].forEach(n=>{ if(n!==live) n.remove(); });
  live.before(...before);
  live.after(...after);
  mountMapSvg();
  return true;
}

function renderNav(isSidebar){
  const active = getActive();
  const tabs = getAllTabs();
  const tabsHtml = tabs.map(t=>{
    const isPinned = active.splitView && active.pinnedTabs.includes(t.id);
    const isActive = !active.splitView && ui.activeTab===t.id;
    return `<button class="${isActive?'active':''}" style="${isPinned?'position:relative;':''}" onclick="setActiveTab('${t.id}')"><span class="nav-icon">${t.icon}</span>${t.label}${isPinned?' 📌':''}</button>`;
  }).join('')
    + `<button onclick="addKartei()" title="Neue Kartei"><span class="nav-icon">➕</span>Kartei</button>`;
  if(isSidebar){ return `<div class="brand-badge" style="margin-bottom:16px;">🎲</div>${tabsHtml}`; }
  return tabsHtml;
}
function setActiveTab(id){
  const active = getActive();
  if(active.splitView && window.innerWidth>=900){ togglePinTab(id); return; }
  ui.activeTab=id; render();
}
function toggleSplitView(){
  updateActive(camp=>({...camp, splitView: !camp.splitView}));
  saveState(); render();
}
function togglePinTab(id){
  updateActive(camp=>{
    const pinned = [...camp.pinnedTabs];
    const idx = pinned.indexOf(id);
    if(idx>=0){ pinned.splice(idx,1); }
    else if(pinned.length<4){ pinned.push(id); }
    return {...camp, pinnedTabs: pinned};
  });
  saveState(); render();
}
function toggleManaging(){
  ui.managing=!ui.managing;
  if(!ui.managing){ ui.tableSelectMode=false; ui.selectedTableIds=[]; ui.confirmBulkDeleteTables=false; }
  render();
}

function renderHeader(){
  const active = getActive();
  const isKarteiTab = active.karteien.some(k=>k.id===ui.activeTab);
  const showGear = ui.activeTab==='dice' || ui.activeTab==='character' || ui.activeTab==='map' || ui.activeTab==='relations' || isKarteiTab;
  const camp = getActiveCampaign();
  return `
  <div class="header">
    <div class="brand">
      <div class="brand-badge">🎲</div>
      <div>
        <h1>Solo RPG</h1>
        <button class="campaign-switch-btn" onclick="openCampaignSwitcher()">${escapeHtml(camp?camp.name:'Kampagne')} ▾</button>
      </div>
    </div>
    <div class="header-actions">
      <button class="icon-btn" onclick="openOptions()" title="Optionen">🛠</button>
      ${getAllTabs().length>1 ? `<button class="icon-btn splitview-btn ${active.splitView?'active':''}" onclick="toggleSplitView()" title="Splitscreen (bis zu 4 Tabs nebeneinander)">⊞</button>` : ''}
      <button class="icon-btn" onclick="exportData()" title="Kampagne exportieren">⬇</button>
      <button class="icon-btn" onclick="triggerImport()" title="Kampagne importieren">⬆</button>
      ${showGear ? `<button class="icon-btn ${ui.managing?'active':''}" onclick="toggleManaging()" title="Verwalten">⚙</button>` : ''}
    </div>
  </div>
  ${saveError ? `<div class="panel" style="border-color:var(--wax);background:rgba(139,46,46,0.18);">
    <div class="row between wrap" style="gap:8px;">
      <span style="font-size:14px;">⚠️ ${escapeHtml(saveError)}</span>
      <div class="row" style="gap:6px;">
        <button class="btn btn-gold" style="padding:6px 10px;font-size:12px;" onclick="exportData()">⬇ Exportieren</button>
        <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="flushSave()">↻ Erneut</button>
      </div>
    </div>
  </div>` : ''}`;
}

function renderActiveTab(){
  return renderTabContent(ui.activeTab);
}
function renderTabContent(tabId){
  const active = getActive();
  switch(tabId){
    case 'dice': return renderDiceTab();
    case 'battle': return renderBattleTab();
    case 'character': return renderCharacterTab();
    case 'notes': return renderNotesTab();
    case 'map': return renderMapTab();
    case 'relations': return renderRelationsTab();
  }
  const kartei = active.karteien.find(k=>k.id===tabId);
  if(kartei) return renderKarteiTab(kartei.id);
  return '';
}
function renderSplitView(){
  const active = getActive();
  const allTabs = getAllTabs();
  const pinned = active.pinnedTabs.map(id=>allTabs.find(t=>t.id===id)).filter(Boolean);
  if(!pinned.length){
    return `<div class="empty" style="padding:48px 0;">
      <span style="font-size:28px;">📌</span>
      <span>Splitscreen ist an — klicke links Tabs an, um sie anzuheften (bis zu 4).</span>
    </div>`;
  }
  return `<div class="split-grid">${pinned.map(t=>`
    <div class="split-pane">
      <div class="row between split-pane-header">
        <span class="label" style="color:var(--gold);">${t.icon} ${escapeHtml(t.label)}</span>
        <button class="icon-btn raised" onclick="togglePinTab('${t.id}')" title="Lösen">✕</button>
      </div>
      <div class="split-pane-body">${renderTabContent(t.id)}</div>
    </div>`).join('')}
  </div>`;
}

function renderModals(){
  let html = '';
  if(ui.showOptions) html += renderOptionsModal();
  if(ui.showCampaignSwitcher) html += renderCampaignSwitcherModal();
  if(ui.editingCharacterId) html += renderCharacterRenameModal();
  if(ui.editingTableId) html += renderTableModal();
  if(ui.showImport) html += renderImportModal();
  if(ui.editingComboId) html += renderComboModal();
  if(ui.editingKarteiEntry) html += renderKarteiEntryModal();
  if(ui.editingKarteiId) html += renderKarteiRenameModal();
  if(ui.editingSectionId) html += renderSectionModal();
  if(ui.editingFieldId) html += renderFieldModal();
  if(ui.linkPicker) html += renderLinkPickerModal();
  if(ui.editingMapNodeId) html += renderMapNodeModal();
  if(ui.editingMapEdgeId) html += renderMapEdgeModal();
  if(ui.editingRelationNodeId) html += renderRelationNodeModal();
  if(ui.editingRelationEdgeId) html += renderRelationEdgeModal();
  return html;
}

function renderOptionsModal(){
  const active = getActive();
  const camp = getActiveCampaign();
  const tabs = getAllTabs();
  const tabRows = tabs.map((t, idx)=>{
    const karteiObj = !t.special ? active.karteien.find(k=>k.id===t.id) : null;
    const iconHandler = t.special ? `onSpecialTabIcon('${t.id}',this)` : `onKarteiIconInput('${t.id}',this)`;
    const nameHandler = t.special ? `onSpecialTabLabel('${t.id}',this)` : `onKarteiNameInline('${t.id}',this)`;
    return `<div style="background:var(--panel-raised);border:1px solid var(--border);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;">
      <div class="row">
        <input type="text" value="${escapeHtml(t.icon)}" oninput="${iconHandler}" onchange="render()" maxlength="4" style="width:48px;text-align:center;flex-shrink:0;">
        <input type="text" value="${escapeHtml(t.label)}" oninput="${nameHandler}" onchange="render()" style="flex:1;">
      </div>
      <div class="row between">
        ${karteiObj
          ? `<button class="btn btn-raised" style="padding:5px 8px;font-size:11px;" onclick="toggleKarteiCheckboxFeature('${t.id}')">${karteiObj.hasCheckbox?'☑':'☐'} Checkbox-Feld</button>`
          : `<span class="small-muted">Fester Tab</span>`}
        <div class="row" style="gap:4px;">
          <button class="icon-btn raised" style="${idx===0?'opacity:0.3;':''}" ${idx===0?'disabled':''} onclick="moveTab('${t.id}',-1)">↑</button>
          <button class="icon-btn raised" style="${idx===tabs.length-1?'opacity:0.3;':''}" ${idx===tabs.length-1?'disabled':''} onclick="moveTab('${t.id}',1)">↓</button>
          ${karteiObj ? `<button class="icon-btn raised" style="color:var(--wax);" onclick="deleteKartei('${t.id}')">🗑</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
  const dieRows = (field) => active[field].map((d,idx)=>`
    <div class="row" style="gap:6px;">
      <input type="text" value="${escapeHtml(d.name)}" oninput="onOracleDieName('${d.id}',this,'${field}')" style="width:76px;flex-shrink:0;">
      <input type="text" value="${escapeHtml(d.formula)}" oninput="onOracleDieFormula('${d.id}',this,'${field}')" placeholder="z.B. 1d20" style="flex:1;">
      <button class="icon-btn raised" style="${idx===0?'opacity:0.3;':''}" ${idx===0?'disabled':''} onclick="moveOracleDie('${d.id}',-1,'${field}')">↑</button>
      <button class="icon-btn raised" style="${idx===active[field].length-1?'opacity:0.3;':''}" ${idx===active[field].length-1?'disabled':''} onclick="moveOracleDie('${d.id}',1,'${field}')">↓</button>
      <button class="icon-btn raised" style="color:var(--wax);" onclick="deleteOracleDie('${d.id}','${field}')">🗑</button>
    </div>`).join('');
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Optionen — ${escapeHtml(camp?camp.name:'')}</span>
      <button class="icon-btn" onclick="closeOptions()">✕</button></div>
    <div style="display:flex;flex-direction:column;gap:20px;max-height:70vh;overflow-y:auto;padding-right:2px;">
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="label">📑 Tabs</span>
        <p class="small-muted">Name, Icon (ein Emoji) und Reihenfolge aller Tabs — auch der festen wie Kampf, Orakel, Charakter, Text.</p>
        ${tabRows}
        <button class="btn btn-raised" onclick="addKartei()">+ Neue Kartei</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="label">🎲 Orakel-Würfel</span>
        <p class="small-muted">Name + Formel (z.B. 2W6, 3W7+1) der schnellen Würfel-Buttons im Orakel-Tab. Eigener Verlauf, unabhängig vom Kampf-Tab.</p>
        ${dieRows('oracleDice')}
        <button class="btn btn-raised" onclick="addOracleDie('oracleDice')">+ Würfel hinzufügen</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="label">⚔️ Kampf-Würfel</span>
        <p class="small-muted">Eigene Würfel-Buttons und eigener Ergebnis-Verlauf für den Kampf-Tab, getrennt vom Orakel.</p>
        ${dieRows('battleDice')}
        <button class="btn btn-raised" onclick="addOracleDie('battleDice')">+ Würfel hinzufügen</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="label">🗺️ Gelände-Grafiken</span>
        ${Object.keys(TERRAIN_IMAGES).length
          ? `<p class="small-muted" style="margin:0;">${Object.keys(TERRAIN_IMAGES).length} eigene Grafiken aktiv (nur auf diesem Gerät gespeichert, nicht auf der Webseite).</p>
             <div class="row wrap" style="gap:8px;">
               <button class="btn btn-raised" onclick="triggerTerrainImagesImport()">⬆ Andere Datei importieren</button>
               <button class="btn btn-outline-wax" onclick="removeTerrainImages()">Entfernen (gezeichnete Symbole nutzen)</button>
             </div>`
          : `<p class="small-muted" style="margin:0;">Eigene Kacheln für Hex-Karten (z.B. aus dem Atlas). Die Datei bleibt auf diesem Gerät — sie wird nicht auf die Webseite hochgeladen. Ohne Import werden gezeichnete Symbole verwendet.</p>
             <button class="btn btn-raised" style="align-self:flex-start;" onclick="triggerTerrainImagesImport()">⬆ Grafiken importieren (.json)</button>`}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <span class="label">💾 Speicher</span>
        ${renderStorageSection()}
      </div>
    </div>
  </div></div>`;
}

function renderStorageSection(){
  const persistNote = storagePersisted===true ? 'Dauerhafter Speicher ist aktiv.'
    : storagePersisted===false ? 'Der Browser darf die Daten bei Speicherknappheit löschen — regelmäßig exportieren!' : '';
  if(storageBackend!=='idb'){
    return `<p class="small-muted">Daten: ${formatBytes(lastSavedBytes)} von ca. 5 MB (localStorage — IndexedDB ist in diesem Browser nicht verfügbar, daher keine automatischen Sicherungen). ${persistNote}</p>`;
  }
  const quota = storageEstimate && storageEstimate.quota
    ? ` · Browser-Speicher: ${formatBytes(storageEstimate.usage||0)} von ${formatBytes(storageEstimate.quota)} belegt (inkl. Sicherungen)` : '';
  let list;
  if(ui.backups===null) list = `<p class="small-muted">Lade Sicherungen…</p>`;
  else if(!ui.backups.length) list = `<p class="small-muted">Noch keine Sicherungen.</p>`;
  else list = ui.backups.map(b=>{
    const when = new Date(b.time).toLocaleString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    const confirming = ui.confirmRestoreBackupId===b.id;
    return `<div class="list-item-row" style="flex-wrap:wrap;">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;">
        <span style="font-size:13px;">${when} · ${escapeHtml(b.reason)}</span>
        <span class="small-muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${formatBytes(b.bytes)} · ${escapeHtml(b.names||'')}</span>
      </div>
      ${confirming
        ? `<button class="btn" style="background:var(--wax);color:var(--text);padding:4px 8px;font-size:12px;" onclick="restoreBackup(${b.id})">Ersetzen</button>
           <button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="cancelRestoreBackup()">Abbrechen</button>`
        : `<button class="icon-btn raised" title="Wiederherstellen" onclick="askRestoreBackup(${b.id})">↺</button>
           <button class="icon-btn raised" title="Herunterladen" onclick="downloadBackup(${b.id})">⬇</button>`}
    </div>`;
  }).join('');
  return `<p class="small-muted">Daten: ${formatBytes(lastSavedBytes)}${quota}. ${persistNote}</p>
    <p class="small-muted">Sicherungen (automatisch bei App-Start, alle 10 Minuten und vor Importen/Löschen; die letzten ${BACKUP_KEEP} bleiben). Wiederherstellen ersetzt <b>alle</b> Kampagnen — der aktuelle Stand wird vorher selbst gesichert.</p>
    ${ui.confirmRestoreBackupId ? `<p class="small-muted" style="color:var(--wax);">Wirklich alle Kampagnen durch diese Sicherung ersetzen?</p>` : ''}
    ${list}
    <button class="btn btn-raised" onclick="manualBackup()">💾 Jetzt sichern</button>`;
}

function renderCampaignSwitcherModal(){
  const rows = STATE.campaigns.map(camp=>{
    if(ui.editingCampaignId===camp.id){
      return `<div class="row" style="background:var(--panel-raised);border:1px solid var(--gold);border-radius:10px;padding:8px;">
        <input type="text" value="${escapeHtml(ui.campaignNameDraft)}" oninput="onCampaignNameDraft(this)" style="flex:1;">
        <button class="icon-btn" onclick="saveCampaignName()">✓</button>
        ${STATE.campaigns.length>1 ? `<button class="icon-btn" style="color:var(--wax);" onclick="deleteCampaign('${camp.id}')">🗑</button>` : ''}
      </div>`;
    }
    const active = camp.id===STATE.activeCampaignId;
    return `<div class="row">
      <button class="row between" style="flex:1;border-radius:10px;padding:10px 12px;background:${active?'var(--panel-raised)':'transparent'};border:1px solid ${active?'var(--gold)':'var(--border)'};color:var(--text);" onclick="switchCampaign('${camp.id}')">
        <span>${escapeHtml(camp.name)}</span>${active?'<span style="color:var(--gold);">✓</span>':''}
      </button>
      <button class="icon-btn raised" onclick="startRenameCampaign('${camp.id}')">✎</button>
    </div>`;
  }).join('');
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Kampagne wechseln</span>
      <button class="icon-btn" onclick="closeCampaignSwitcher()">✕</button></div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:288px;overflow-y:auto;">${rows}</div>
    <button class="btn btn-gold" onclick="addCampaign()">+ Neue Kampagne</button>
  </div></div>`;
}

function renderCharacterRenameModal(){
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Charakter umbenennen</span>
      <button class="icon-btn" onclick="cancelRenameCharacter()">✕</button></div>
    <input type="text" value="${escapeHtml(ui.characterNameDraft)}" placeholder="Name des Charakters" oninput="onCharacterNameDraft(this)">
    <button class="btn btn-gold" onclick="saveCharacterName()">✓ Speichern</button>
  </div></div>`;
}
