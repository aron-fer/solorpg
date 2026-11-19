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
function toggleAreasEnabled(){ updateActive(camp=>({...camp, areasEnabled:!camp.areasEnabled})); saveState(); render(); }
function closeOptions(){ ui.showOptions=false; render(); }

// ---- Campaigns ----
function openCampaignSwitcher(){ ui.showCampaignSwitcher=true; render(); }
function closeCampaignSwitcher(){ ui.showCampaignSwitcher=false; render(); }
function switchCampaign(id){
  // Leaving a campaign with unsaved changes: save it to GitHub first (if it is saved there).
  const prev = STATE.activeCampaignId;
  if(typeof syncConfigured==='function' && syncConfigured() && syncChanged && prev!==id && syncCampState(prev) && syncCampState(prev).sha) syncSave(prev, {quiet:true});
  STATE.activeCampaignId=id; ui.showCampaignSwitcher=false; saveState();
  if(typeof syncChanged!=='undefined') syncChanged = false;
  render();
  if(typeof syncCheck==='function') syncCheck(id, true);
}
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
  if(isDesk()) deskSync();   // the sidebar marks what the panes show
  document.getElementById('sidebar').innerHTML = renderNav(true);
  const nav = document.getElementById('bottomnav');
  const navScroll = nav.scrollLeft;
  nav.innerHTML = renderNav(false);
  nav.scrollLeft = navScroll;
  // Keep the active tab visible when the bar scrolls sideways.
  const act = nav.querySelector('button.active');
  if(act){
    if(act.offsetLeft < nav.scrollLeft) nav.scrollLeft = act.offsetLeft;
    else if(act.offsetLeft + act.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = act.offsetLeft + act.offsetWidth - nav.clientWidth;
  }
  const desk = isDesk();
  const body = desk ? renderDesk() : renderActiveTab();
  const main = document.getElementById('main');
  main.classList.toggle('desk', desk);
  document.body.classList.toggle('desk-body', desk);
  const html = renderHeader() + body + renderModals();
  // Columns and panes on the PC scroll on their own: keep where they were.
  const keptScroll = {};
  main.querySelectorAll('[data-keep-scroll]').forEach(el=>{ keptScroll[el.dataset.keepScroll] = el.scrollTop; });
  // Replacing the HTML resets scroll positions: keep the page's and those of
  // open sheets (e.g. Optionen), so toggling something doesn't jump to the top.
  const pageY = window.scrollY;
  const sheetY = [...main.querySelectorAll('.modal-sheet, .modal-scroll')].map(el=>el.scrollTop);
  if(!patchAroundMapPanel(main, html)){
    main.innerHTML = html;
    mountMapSvg(); // keeps the (possibly huge) map SVG between renders
    restoreZoomViews();
  }
  main.querySelectorAll('.modal-sheet, .modal-scroll').forEach((el,i)=>{ if(sheetY[i]) el.scrollTop = sheetY[i]; });
  main.querySelectorAll('[data-keep-scroll]').forEach(el=>{ const y = keptScroll[el.dataset.keepScroll]; if(y) el.scrollTop = y; });
  if(window.scrollY!==pageY) window.scrollTo(0, pageY);
}
// If the map panel is on screen and stays there, replace only the page parts
// around it. Taking a map with thousands of hexes out of the page and back
// makes the browser restyle all of them; leaving it in place avoids that
// (and keeps its scroll position for free). On the PC the map sits inside a
// pane: the same is done on every level up to #main, as long as the nesting
// is the same. Returns false if not applicable.
function patchAroundMapPanel(main, html){
  const live = document.getElementById('map-panel');
  if(!live || !main.contains(live)) return false;
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  const fresh = tpl.querySelector('#map-panel');
  if(!fresh) return false;
  const chain = (el, root) => { const out = []; while(el && el!==root){ out.push(el); el = el.parentNode; } return el ? out : null; };
  const lc = chain(live, main), fc = chain(fresh, tpl);
  if(!lc || !fc || lc.length!==fc.length) return false;
  for(let i=1; i<lc.length; i++){
    if(lc[i].tagName!==fc[i].tagName || lc[i].className!==fc[i].className) return false;
  }
  for(let i=0; i<lc.length; i++){
    const lNode = lc[i], fNode = fc[i];
    const lParent = lc[i+1] || main, fParent = fc[i+1] || tpl;
    const before = [], after = [];
    let seen = false;
    [...fParent.childNodes].forEach(n=>{ if(n===fNode){ seen = true; return; } (seen ? after : before).push(n); });
    [...lParent.childNodes].forEach(n=>{ if(n!==lNode) n.remove(); });
    lNode.before(...before);
    lNode.after(...after);
    if(lParent!==main){
      [...lParent.attributes].forEach(at=>{ if(!fParent.hasAttribute(at.name)) lParent.removeAttribute(at.name); });
      [...fParent.attributes].forEach(at=>{ if(lParent.getAttribute(at.name)!==at.value) lParent.setAttribute(at.name, at.value); });
    }
  }
  mountMapSvg();
  return true;
}

function renderNav(isSidebar){
  const active = getActive();
  const tabs = getAllTabs();
  const karteiIds = new Set(active.karteien.map(k=>k.id));
  // PC: tabs shown in a pane are marked; the oracle is marked while docked.
  const desk = isDesk();
  const shown = desk ? deskPanes() : null;
  const isOn = id => desk ? (id==='dice' ? deskDockOpen() : shown.includes(id)) : ui.activeTab===id;
  const navBtn = (onclick, icon, label, isActive, isPinned) => `<button class="${isActive?'active':''}" style="${isPinned?'position:relative;':''}" onclick="${onclick}"><span class="nav-icon">${icon}</span><span class="nav-label">${label}${isPinned?' 📌':''}</span></button>`;
  // All Karteien share one tab ("Karteien"), placed where the first Kartei sits in the tab order.
  let karteienDone = false;
  const tabsHtml = tabs.map(t=>{
    if(karteiIds.has(t.id)){
      if(karteienDone) return '';
      karteienDone = true;
      const isActive = desk ? shown.some(id=>karteiIds.has(id)) : karteiIds.has(ui.activeTab);
      return navBtn('openKarteienTab()', '🗂️', 'Karteien', isActive, false);
    }
    return navBtn(`setActiveTab('${t.id}')`, t.icon, t.label, isOn(t.id), false);
  }).join('')
    + (karteienDone ? '' : navBtn('addKartei()', '➕', 'Kartei', false, false));
  if(isSidebar){ return `<div class="brand-badge" style="margin-bottom:16px;">🎲</div>${tabsHtml}`; }
  return tabsHtml;
}
// The Karteien tab opens the Kartei used last (else the first one).
function openKarteienTab(){
  const ks = getAllTabs().filter(t=>!t.special);
  // PC: a Kartei already open in a pane just gets the focus.
  const open = isDesk() && deskPanes().find(id=>ks.some(t=>t.id===id));
  const id = open || (ks.some(t=>t.id===ui.lastKarteiId) ? ui.lastKarteiId : (ks[0] && ks[0].id));
  if(id) setActiveTab(id);
}
// Switching Kartei via the pills; on the PC it replaces the Kartei in its pane.
function selectKartei(id, fromId){
  ui.lastKarteiId = id;
  if(isDesk() && fromId){ const i = deskPanes().indexOf(fromId); if(i>=0) ui.deskFocus = i; }
  ui.activeTab = id; render();
}
function setActiveTab(id){
  // PC: the oracle is docked; its button folds the dock in and out.
  if(isDesk() && id==='dice'){ toggleDeskDock(); return; }
  ui.activeTab=id; render();
}

// ---- PC workspace: oracle docked on the left, 1 or 2 panes on the right ----
// The panes show what ui.activeTab names: opening a tab (sidebar, a link, …)
// puts it into the pane with the focus, unless it is open already. Layout
// choices belong to this device, not to the campaign.
const DESK_MIN_WIDTH = 1100;
function isDesk(){ return window.innerWidth >= DESK_MIN_WIDTH; }
let deskPrefsCache = null;
function deskPrefs(){
  if(!deskPrefsCache){
    let p = {};
    try{ p = JSON.parse(localStorage.getItem('solorpg-desk') || '{}') || {}; }catch(e){}
    deskPrefsCache = {panes: Array.isArray(p.panes) ? p.panes : [], two: p.two!==false, dock: p.dock!==false};
  }
  return deskPrefsCache;
}
function saveDeskPrefs(){ try{ localStorage.setItem('solorpg-desk', JSON.stringify(deskPrefsCache)); }catch(e){} }
function deskDockOpen(){ return deskPrefs().dock; }
function toggleDeskDock(){ deskPrefs().dock = !deskPrefs().dock; saveDeskPrefs(); render(); }
function toggleSplitView(){ deskPrefs().two = !deskPrefs().two; ui.deskFocus = 0; saveDeskPrefs(); render(); }
function deskPaneOptions(){ return getAllTabs().filter(t=>t.id!=='dice'); }
// Both pane contents (the second is kept while only one is shown).
function deskPaneList(){
  const valid = deskPaneOptions().map(t=>t.id);
  const panes = deskPrefs().panes.filter((id,i,arr)=>valid.includes(id) && arr.indexOf(id)===i).slice(0,2);
  ['map','notes', ...valid].forEach(id=>{ if(panes.length<2 && valid.includes(id) && !panes.includes(id)) panes.push(id); });
  return panes;
}
function deskPanes(){ const panes = deskPaneList(); return deskPrefs().two ? panes : panes.slice(0,1); }
// Bring the panes in line with ui.activeTab (see above).
function deskSync(){
  const panes = deskPaneList();
  const n = deskPrefs().two ? Math.min(2, panes.length) : 1;
  let focus = Math.min(ui.deskFocus||0, n-1);
  const t = ui.activeTab;
  if(t && t!=='dice' && deskPaneOptions().some(x=>x.id===t)){
    const at = panes.slice(0,n).indexOf(t);
    if(at>=0) focus = at;
    else { const old = panes.indexOf(t); if(old>=0) panes[old] = panes[focus]; panes[focus] = t; }
  }
  ui.deskFocus = focus;
  if(panes[focus]) ui.activeTab = panes[focus];
  if(panes.join()!==deskPrefs().panes.join()){ deskPrefs().panes = panes; saveDeskPrefs(); }
  return panes.slice(0,n);
}
// Clicking into a pane gives it the focus (no re-render needed).
function deskFocusPane(i){
  const panes = deskPanes();
  if(!panes[i] || ui.deskFocus===i) return;
  ui.deskFocus = i; ui.activeTab = panes[i];
  document.querySelectorAll('.desk-pane').forEach((el,j)=>el.classList.toggle('focus', j===i));
}
function deskSetPane(i, id){ ui.deskFocus = i; ui.activeTab = id; render(); }
function deskClosePane(i){
  const panes = deskPaneList();
  if(i===0) deskPrefs().panes = [panes[1], panes[0]];
  deskPrefs().two = false; ui.deskFocus = 0; saveDeskPrefs();
  ui.activeTab = deskPrefs().panes[0] || panes[0];
  render();
}
function renderDesk(){
  const panes = deskSync();
  const opts = deskPaneOptions();
  const paneHtml = panes.map((id,i)=>{
    const select = `<select class="pane-select" onchange="deskSetPane(${i}, this.value)">${opts.map(t=>`<option value="${t.id}" ${t.id===id?'selected':''}>${t.icon} ${escapeHtml(t.label)}</option>`).join('')}</select>`;
    return `<div class="desk-col desk-pane ${panes.length>1 && ui.deskFocus===i ? 'focus' : ''}" onpointerdown="deskFocusPane(${i})">
      <div class="desk-hd">${select}
        ${panes.length>1 ? `<button class="icon-btn" style="margin-left:auto;padding:2px 6px;" onclick="deskClosePane(${i})" title="Bereich schließen">✕</button>` : ''}</div>
      <div class="desk-scroll" data-keep-scroll="pane-${i}-${id}">${renderTabContent(id)}</div>
    </div>`;
  }).join('');
  return `<div class="desk-cols ${deskDockOpen() ? '' : 'no-dock'}">${deskDockOpen() ? renderOracleDock() : ''}${paneHtml}</div>`;
}
// Is a tab on screen right now (phone: the open tab; PC: a pane)?
function isTabShown(id){ return isDesk() ? deskPanes().includes(id) : ui.activeTab===id; }

function toggleHeaderMenu(){ ui.headerMenuOpen = !ui.headerMenuOpen; render(); }
function toggleManaging(){
  ui.managing=!ui.managing;
  if(!ui.managing){ ui.tableSelectMode=false; ui.selectedTableIds=[]; ui.confirmBulkDeleteTables=false; }
  render();
}

function renderHeader(){
  const active = getActive();
  const isKarteiTab = active.karteien.some(k=>k.id===ui.activeTab);
  const showGear = isDesk() || ui.activeTab==='dice' || ui.activeTab==='character' || ui.activeTab==='map' || ui.activeTab==='relations' || isKarteiTab;
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
      ${isDesk() && deskPaneOptions().length>1 ? `<button class="icon-btn ${deskPrefs().two?'active':''}" onclick="toggleSplitView()" title="${deskPrefs().two ? 'Nur ein Bereich' : 'Zwei Bereiche nebeneinander'}">◫</button>` : ''}
      ${renderSyncHeaderButton()}
      ${showGear ? `<button class="btn ${ui.managing?'btn-gold':'btn-raised'} edit-toggle" onclick="toggleManaging()">${ui.managing?'✓ Fertig':'✎ Bearbeiten'}</button>` : ''}
      <div style="position:relative;">
        <button class="icon-btn ${ui.headerMenuOpen?'active':''}" onclick="toggleHeaderMenu()" title="Menü" aria-label="Menü">⋯</button>
        ${ui.headerMenuOpen ? `<div class="menu-backdrop" onclick="toggleHeaderMenu()"></div>
        <div class="header-menu">
          ${syncConfigured() ? `<button onclick="toggleHeaderMenu(); syncSave()">☁ Auf GitHub speichern</button>
          <button onclick="toggleHeaderMenu(); openSyncList()">☁ Aus GitHub laden…</button>` : `<button onclick="toggleHeaderMenu(); openOptions()">☁ Speichern auf GitHub einrichten…</button>`}
          <button onclick="toggleHeaderMenu(); openOptions()">🛠 Optionen</button>
          <button onclick="toggleHeaderMenu(); exportData()">⬇ Kampagne exportieren</button>
          <button onclick="toggleHeaderMenu(); triggerImport()">⬆ Kampagne importieren</button>
        </div>` : ''}
      </div>
    </div>
  </div>
  ${renderSyncBanner()}
  ${ui.managing && showGear ? `<div class="edit-banner"><span>✎ Bearbeiten-Modus</span><button class="btn btn-gold" onclick="toggleManaging()">✓ Fertig</button></div>` : ''}
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
  if(kartei){
    ui.lastKarteiId = kartei.id;
    const pills = getAllTabs().filter(t=>!t.special).map(t=>`<button class="pill ${t.id===kartei.id?'active':'inactive'}" onclick="selectKartei('${t.id}','${kartei.id}')">${t.icon} ${escapeHtml(t.label)}</button>`).join('')
      + `<button class="pill inactive" onclick="addKartei()" title="Neue Kartei">+ Kartei</button>`;
    return `<div class="pill-scroll">${pills}</div>` + renderKarteiTab(kartei.id);
  }
  return '';
}
function renderModals(){
  let html = '';
  if(ui.showOptions) html += renderOptionsModal();
  if(ui.showCampaignSwitcher) html += renderCampaignSwitcherModal();
  if(ui.editingCharacterId) html += renderCharacterRenameModal();
  if(ui.editingTableId) html += renderTableModal();
  if(ui.showImport) html += renderImportModal();
  if(ui.rollPopup) html += renderRollPopup();
  if(ui.sync && ui.sync.listOpen) html += renderSyncListModal();
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
    <div class="modal-scroll" style="display:flex;flex-direction:column;gap:20px;max-height:70vh;overflow-y:auto;padding-right:2px;">
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
        <span class="label">🗺️ Karte</span>
        <button class="row between" style="border-radius:10px;padding:10px 12px;background:${active.areasEnabled?'var(--panel-raised)':'transparent'};border:1px solid ${active.areasEnabled?'var(--gold)':'var(--border)'};color:var(--text);text-align:left;" onclick="toggleAreasEnabled()">
          <span>Gebiete (Begegnungstabelle pro Feld, z.B. Hyperborea)</span>${active.areasEnabled?'<span style="color:var(--gold);">✓</span>':''}
        </button>
        <p class="small-muted" style="margin:0;">Aus: Gebiet-Pinsel, Gebiet-Feld und Begegnungs-Knöpfe sind ausgeblendet. Schon vergebene Gebiete bleiben gespeichert.</p>
      </div>
      ${renderSyncOptions()}
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
