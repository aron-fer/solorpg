// Data model, migrations (ensureCampaign), STATE/ui, persistence.
function emptyCampaignData(){
  return {
    tables:[], combos:[], log:[], characters:[], activeCharacterId:null, karteien:[], statblocks:[], journal:[],
    oracleDice: [4,6,8,10,12,20,100].map(s=>({id:uid(), name:`W${s}`, formula:`1d${s}`})),
    battleDice: [4,6,8,10,12,20,100].map(s=>({id:uid(), name:`W${s}`, formula:`1d${s}`})),
    battleLog: [],
    maps: [], activeMapId: null,
    relationNodes: [], relationEdges: [],
    tabOrder: [], tabOverrides: {}, collapsedGroups: {}, groupOrder: [], splitView: false, pinnedTabs: [],
  };
}
function ensureCampaign(data){
  const d = Object.assign({}, emptyCampaignData(), data);
  const hadJournal = data && Object.prototype.hasOwnProperty.call(data, 'journal');
  if(!hadJournal){
    if(typeof d.notes === 'string' && d.notes.trim()){
      d.journal = [{id:uid(), title:'Notizen', type:'text', value:d.notes, collapsed:false}];
    } else {
      d.journal = [];
    }
  }
  delete d.notes;
  const hadKarteien = data && Object.prototype.hasOwnProperty.call(data, 'karteien');
  if(!hadKarteien){
    const legacyThreads = (d.threads||[]).map(t => t.title !== undefined ? t : {id:t.id, title:t.text||'', notes:'', resolved:!!t.resolved});
    d.karteien = [
      {id:uid(), name:'Threads', hasCheckbox:true, entries: legacyThreads.map(t=>({id:t.id||uid(), title:t.title, notes:t.notes||'', resolved:!!t.resolved}))},
      {id:uid(), name:'NPCs', hasCheckbox:false, entries: (d.npcs||[]).map(n=>({id:n.id||uid(), title:n.name, notes:n.notes||'', resolved:false}))},
      {id:uid(), name:'Orte', hasCheckbox:false, entries: (d.places||[]).map(p=>({id:p.id||uid(), title:p.name, notes:p.notes||'', resolved:false}))},
    ];
  }
  delete d.threads; delete d.npcs; delete d.places;
  if(!d.oracleDice || !d.oracleDice.length) d.oracleDice = emptyCampaignData().oracleDice;
  if(!d.battleDice || !d.battleDice.length) d.battleDice = emptyCampaignData().battleDice;
  d.battleLog = Array.isArray(d.battleLog) ? d.battleLog : [];
  d.oracleDice = d.oracleDice.map(die=>({id:die.id||uid(), name:die.name||'', formula:die.formula||''}));
  d.statblocks = (d.statblocks||[]).map(sb=>({
    id: sb.id||uid(), name: sb.name!=null?sb.name:'', hp: sb.hp!=null?sb.hp:'10', notes: sb.notes||'',
    statuses: (sb.statuses||[]).map(st=>({id:st.id||uid(), name:st.name||'Status', value: Array.isArray(st.value)&&st.value.length===6 ? st.value : [false,false,false,false,false,false]})),
  }));
  d.karteien = d.karteien.map(k=>({
    id:k.id||uid(), name:k.name||'Kartei', icon:k.icon||'📇', hasCheckbox: !!k.hasCheckbox,
    entries: (k.entries||[]).map(e=>({id:e.id||uid(), title:e.title||'', notes:e.notes||'', resolved:!!e.resolved, parentId:e.parentId||null, collapsed:!!e.collapsed})),
  }));
  d.tabOverrides = Object.assign({}, d.tabOverrides || {});
  {
    const validIds = new Set(Object.keys(SPECIAL_TABS).concat(d.karteien.map(k=>k.id)));
    let order = Array.isArray(d.tabOrder) ? d.tabOrder.filter(id=>validIds.has(id)) : [];
    if(!order.length) order = ['notes','dice','character', ...d.karteien.map(k=>k.id), 'map', 'relations', 'battle'];
    validIds.forEach(id=>{ if(!order.includes(id)) order.push(id); });
    d.tabOrder = order;
    d.pinnedTabs = (Array.isArray(d.pinnedTabs) ? d.pinnedTabs : []).filter(id=>validIds.has(id)).slice(0,4);
  }
  // Characters: backfill ids and give every field a reference tier (surface/scene/rare).
  // Counters default to surface since they're explicitly things that change during play.
  d.characters = (d.characters||[]).map(c=>({
    id: c.id||uid(), name: c.name||'Charakter',
    sections: (c.sections||[]).map(s=>({
      id: s.id||uid(), name: s.name||'Bereich', collapsed: !!s.collapsed,
      fields: (s.fields||[]).map(f=>({
        id: f.id||uid(), name: f.name||'Feld', type: f.type||'text', value: f.value,
        tier: (f.tier==='surface'||f.tier==='scene'||f.tier==='rare') ? f.tier : (f.type==='counter' ? 'surface' : 'rare'),
      })),
    })),
  }));
  if(!d.characters.some(c=>c.id===d.activeCharacterId)) d.activeCharacterId = d.characters[0] ? d.characters[0].id : null;
  // Maps: dungeon/hex-crawl style node graphs, one active map at a time.
  d.maps = (d.maps||[]).map(m=>({
    id: m.id||uid(), name: m.name||'Karte', description: m.description||'',
    markerNodeId: m.markerNodeId||null,
    grid: (m.grid==='square'||m.grid==='hex') ? m.grid : 'none',
    gridSize: m.gridSize>0 ? m.gridSize : 40,
    nodes: (m.nodes||[]).map((n,idx)=>({
      id: n.id||uid(), name: n.name||('Raum '+(idx+1)), num: n.num!=null?String(n.num):String(idx+1),
      x: n.x!=null?n.x:(60+(idx%4)*80), y: n.y!=null?n.y:(50+Math.floor(idx/4)*80),
      r: n.r!=null?n.r:16, desc: n.desc||'',
    })),
    edges: (m.edges||[]).map(e=>({
      id: e.id||uid(), from:e.from, to:e.to,
      type: e.type==='secret' ? 'secret' : 'open',
      oneway: !!e.oneway,
    })),
  }));
  if(!d.maps.some(m=>m.id===d.activeMapId)) d.activeMapId = d.maps[0] ? d.maps[0].id : null;
  // Relations: a single faction/NPC relationship web per campaign. Layout is
  // recomputed on the fly (a simple circle), so nodes carry no position.
  d.relationNodes = (d.relationNodes||[]).map(n=>({id:n.id||uid(), name:n.name||'Unbenannt'}));
  {
    const validNodeIds = new Set(d.relationNodes.map(n=>n.id));
    d.relationEdges = (d.relationEdges||[]).filter(e=>validNodeIds.has(e.from)&&validNodeIds.has(e.to)).map(e=>({
      id: e.id||uid(), from:e.from, to:e.to,
      label: e.label||'kennt', weight: Math.max(1, Math.min(20, parseInt(e.weight,10)||10)),
    }));
  }
  d.tables = (d.tables||[]).map(t=>({
    id: t.id, name: t.name, mode: t.mode || 'list',
    distMode: t.distMode || 'equal', formula: t.formula || '',
    group: (t.group||'').trim(),
    entries: migrateTableEntries(t.entries),
    aspects: (t.aspects||[]).map(a=>({
      id: a.id || uid(), name: a.name,
      distMode: a.distMode || 'equal', formula: a.formula || '',
      options: migrateTableEntries(a.options),
    })),
  }));
  d.collapsedGroups = Object.assign({}, d.collapsedGroups || {});
  d.splitView = !!d.splitView;
  {
    const presentGroups = [];
    d.tables.forEach(t=>{ if(t.group && !presentGroups.includes(t.group)) presentGroups.push(t.group); });
    let order = Array.isArray(d.groupOrder) ? d.groupOrder.filter(g=>presentGroups.includes(g)) : [];
    presentGroups.forEach(g=>{ if(!order.includes(g)) order.push(g); });
    d.groupOrder = order;
  }
  return d;
}
function migrateLegacy(parsed){
  const campId = uid();
  const oldChar = parsed.character && parsed.character.sections ? parsed.character : null;
  const characters = (oldChar && oldChar.sections.length) ? [{id:uid(), name:'Charakter 1', sections:oldChar.sections}] : [];
  const journal = (parsed.notes && parsed.notes.trim()) ? [{id:uid(), title:'Notizen', type:'text', value:parsed.notes, collapsed:false}] : [];
  const data = {
    tables: parsed.tables || [], combos: parsed.combos || [], log: parsed.log || [],
    characters, activeCharacterId: characters[0] ? characters[0].id : null,
    threads: parsed.threads || [], npcs: parsed.npcs || [], places: [], statblocks: parsed.statblocks || [],
    journal,
  };
  return { campaigns:[{id:campId, name:'Kampagne 1'}], campaignData:{[campId]:data}, activeCampaignId:campId };
}

let STATE = { campaigns:[], campaignData:{}, activeCampaignId:null };
let ui = {
  activeTab:'notes', managing:false, confirmClear:{oracle:false, battle:false},
  formulaOracle:'', formulaBattle:'',
  editingTableId:null, tableDraft:null,
  tableSelectMode:false, selectedTableIds:[], confirmBulkDeleteTables:false, bulkGroupChoice:'', bulkGroupNewName:'',
  editingComboId:null, comboDraft:null,
  editingKarteiEntry:null, karteiEntryDraft:null,
  editingKarteiId:null, karteiNameDraft:'',
  editingSectionId:null, sectionDraft:null,
  editingFieldId:null, editingFieldSectionId:null, fieldDraft:null,
  linkPicker:null, linkPickerCandidates:[],
  showOptions:false,
  showImport:false, importText:'',
  showCampaignSwitcher:false, editingCampaignId:null, campaignNameDraft:'',
  editingCharacterId:null, characterNameDraft:'',
  journalEditingId:null,
  characterViewMode:'full',
  selectedMapNodeId:null, mapMoveArmedId:null, mapConnectFrom:null,
  editingMapId:null, mapNameDraft:'',
  editingMapNodeId:null, mapNodeDraft:null,
  editingMapEdgeId:null, mapEdgeDraft:null,
  showStatblockCharPicker:false,
  relationsConnectFrom:null, relationRollResult:null,
  editingRelationNodeId:null, relationNodeDraft:null,
  editingRelationEdgeId:null, relationEdgeDraft:null,
};


function loadState(){
  try{
    let raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ STATE = JSON.parse(raw); lastSavedBytes = raw.length*2; return; }
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      STATE = migrateLegacy(parsed);
      return;
    }
  }catch(e){}
  const id = uid();
  STATE = { campaigns:[{id, name:'Kampagne 1'}], campaignData:{[id]: emptyCampaignData()}, activeCampaignId:id };
}

let saveTimeout=null;
// Last save failure (quota exceeded, storage blocked, ...) — shown as a banner
// so a full localStorage never silently swallows changes.
let saveError=null;
let lastSavedBytes=0;
function saveState(){
  if(saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(flushSave, 300);
}
function flushSave(){
  if(saveTimeout){ clearTimeout(saveTimeout); saveTimeout=null; }
  const hadError = !!saveError;
  try{
    const json = JSON.stringify(STATE);
    localStorage.setItem(STORAGE_KEY, json);
    lastSavedBytes = json.length*2; // localStorage counts UTF-16 code units
    saveError = null;
  }catch(e){
    saveError = (e && (e.name==='QuotaExceededError' || e.code===22 || e.code===1014))
      ? 'Speicher voll — Änderungen werden NICHT gespeichert. Bitte exportieren und alte Kampagnen/Logs löschen.'
      : 'Speichern fehlgeschlagen ('+((e&&e.message)||e)+'). Bitte jetzt exportieren.';
  }
  if(hadError !== !!saveError) render();
}
// Don't lose the last debounced change when the app is closed/backgrounded.
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && saveTimeout) flushSave(); });
window.addEventListener('pagehide', ()=>{ if(saveTimeout) flushSave(); });
function formatBytes(n){ return n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.round(n/1024)+' KB'; }

// ensureCampaign() walks and copies the whole campaign (can be MBs), and
// getActive() is called dozens of times per render. So normalize only when the
// stored object changed (every update replaces it immutably) and write the
// normalized copy back, making later calls a plain identity check.
let normalizedCampaign = null;
function getActive(){
  const id = STATE.activeCampaignId;
  const raw = STATE.campaignData[id];
  if(raw && raw===normalizedCampaign) return raw;
  const norm = ensureCampaign(raw || emptyCampaignData());
  if(raw) STATE.campaignData[id] = norm;
  normalizedCampaign = norm;
  return norm;
}
function getActiveCampaign(){
  return STATE.campaigns.find(c=>c.id===STATE.activeCampaignId) || null;
}
function getCurrentCharacter(){
  const active = getActive();
  return active.characters.find(c=>c.id===active.activeCharacterId) || active.characters[0] || null;
}
function updateActive(updater){
  STATE.campaignData[STATE.activeCampaignId] = updater(getActive());
}
function updateCurrentCharacter(updater){
  const cur = getCurrentCharacter();
  if(!cur) return;
  updateActive(camp => ({...camp, characters: camp.characters.map(c => c.id===cur.id ? updater(c) : c)}));
}
function pushLog(text, ctx){
  ctx = ctx || 'oracle';
  const field = ctx==='battle' ? 'battleLog' : 'log';
  updateActive(camp => ({...camp, [field]: [{id:uid(), time:timeNow(), text}, ...camp[field]].slice(0,200)}));
  saveState();
  setTimeout(()=>{
    window.scrollTo({top:0, behavior:'smooth'});
    const box = document.getElementById('results-log-scroll-'+ctx);
    if(box) box.scrollTop = 0;
  }, 0);
}
