// Data model, migrations (ensureCampaign), STATE/ui, persistence.
function emptyCampaignData(){
  return {
    tables:[], combos:[], log:[], characters:[], activeCharacterId:null, karteien:[], statblocks:[], journal:[],
    oracleDice: [4,6,8,10,12,20,100].map(s=>({id:uid(), name:`W${s}`, formula:`1d${s}`})),
    battleDice: [4,6,8,10,12,20,100].map(s=>({id:uid(), name:`W${s}`, formula:`1d${s}`})),
    battleLog: [],
    maps: [], activeMapId: null,
    relationMaps: [], activeRelationMapId: null,
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
  // Kampf tab: party members (kind 'pc', linked to a character) and enemy
  // groups (kind 'enemy': stat line, specials, one HP pair per creature).
  // Older statblocks had a single hp value — that becomes one creature.
  d.statblocks = (d.statblocks||[]).map(sb=>{
    const kind = sb.kind==='pc' ? 'pc' : 'enemy';
    // Each creature also tracks hit dice (hd/hdMax) for the "HD instead of HP" mode.
    const hdStat = Array.isArray(sb.stats) ? ((sb.stats.find(x=>x && x.k==='HD')||{}).v) : '';
    const hdOf = (m, k) => m[k]!=null && !isNaN(parseInt(m[k],10)) ? Math.max(0, parseInt(m[k],10)) : hdCount(hdStat);
    const members = Array.isArray(sb.members)
      ? sb.members.map(m=>({id:m.id||uid(), hp: parseInt(m.hp,10)||0, max: parseInt(m.max,10)||0, hd: hdOf(m,'hd'), hdMax: hdOf(m,'hdMax')}))
      : [{id:uid(), hp: parseInt(sb.hp,10)||0, max: parseInt(sb.hp,10)||0, hd: hdCount(hdStat), hdMax: hdCount(hdStat)}];
    return {
      id: sb.id||uid(), kind, charId: kind==='pc' ? (sb.charId||null) : null,
      name: sb.name!=null?sb.name:'', notes: sb.notes||'', desc: sb.desc||'',
      stats: Array.isArray(sb.stats) ? sb.stats.filter(x=>x && x.k).map(x=>({k:String(x.k), v:String(x.v==null?'':x.v)})) : [],
      specials: sb.specials||'',
      members: kind==='pc' ? [] : members,
      statuses: (sb.statuses||[]).map(st=>({id:st.id||uid(), name:st.name||'Status', value: Array.isArray(st.value)&&st.value.length===6 ? st.value : [false,false,false,false,false,false]})),
    };
  });
  d.battleRound = Math.max(1, parseInt(d.battleRound,10)||1);
  d.enemyTrack = d.enemyTrack==='hd' ? 'hd' : 'hp';
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
  // Statblock placement of a field/section (sb), its short label (sbAbbr) and,
  // for table fields, which columns to show (sbCols, null = all).
  const normSbProps = (x, places) => ({
    sb: places.includes(x.sb) ? x.sb : null,
    sbAbbr: typeof x.sbAbbr==='string' ? x.sbAbbr : '',
    sbCols: Array.isArray(x.sbCols) ? x.sbCols.filter(Number.isInteger) : null,
  });
  d.characters = (d.characters||[]).map(c=>({
    id: c.id||uid(), name: c.name||'Charakter',
    // Manual order of quick-view items: 'f:<fieldId>' / 's:<sectionId>'
    quickOrder: Array.isArray(c.quickOrder) ? c.quickOrder.filter(k=>typeof k==='string') : [],
    sections: (c.sections||[]).map(s=>({
      id: s.id||uid(), name: s.name||'Bereich', collapsed: !!s.collapsed,
      // Whole section in the quick view: null (per field) | 'surface' | 'scene'
      quick: (s.quick==='surface'||s.quick==='scene') ? s.quick : null,
      ...normSbProps(s, ['line']),
      fields: (s.fields||[]).map(f=>({
        ...normSbProps(f, ['title','head','line']),
        id: f.id||uid(), name: f.name||'Feld', type: f.type==='slots' ? 'spells' : (f.type||'text'), value: f.type==='slots' ? slotsToSpells(f.value) : f.value,
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
    gridSize: m.gridSize>0 ? m.gridSize : 40, cellCentered: !!m.cellCentered,
    nodes: (m.nodes||[]).map((n,idx)=>({
      id: n.id||uid(), name: n.name||('Raum '+(idx+1)), num: n.num!=null?String(n.num):String(idx+1),
      x: n.x!=null?n.x:(60+(idx%4)*80), y: n.y!=null?n.y:(50+Math.floor(idx/4)*80),
      r: n.r!=null?n.r:16, desc: n.desc||'', terrain: n.terrain||null, settlement: n.settlement||null, area: n.area||'',
    })),
    edges: (m.edges||[]).map(e=>({
      id: e.id||uid(), from:e.from, to:e.to,
      type: e.type==='secret' ? 'secret' : 'open',
      oneway: !!e.oneway,
    })),
    turns: m.turns || null,   // turn tracker, normalised in turns.js
  }));
  // Square-grid rooms used to snap to line crossings; they now sit in cell
  // centres. Move old crossing-snapped rooms half a cell, once per map.
  d.maps = d.maps.map(m=>{
    if(m.grid!=='square' || m.cellCentered) return m.cellCentered ? m : {...m, cellCentered:true};
    const s = m.gridSize, h = s/2;
    return {...m, cellCentered:true, nodes: m.nodes.map(n=>(n.x%s===0 && n.y%s===0) ? {...n, x:n.x+h, y:n.y+h} : n)};
  });
  // Areas (encounter tables per hex) are optional; campaigns that already
  // use them keep them on.
  d.areasEnabled = (data && typeof data.areasEnabled==='boolean') ? data.areasEnabled : d.maps.some(m=>m.nodes.some(n=>n.area));
  // Hex maps have no connections: drop any left over from older versions.
  d.maps = d.maps.map(m=>m.grid==='hex' && m.edges.length ? {...m, edges:[]} : m);
  if(!d.maps.some(m=>m.id===d.activeMapId)) d.activeMapId = d.maps[0] ? d.maps[0].id : null;
  // Relations: one or more faction/NPC relationship webs per campaign (e.g. per
  // region or scale). Older data had a single web at campaign level — it
  // becomes the first web. Nodes carry no position: the layout is computed
  // and then saved per web in `layout`.
  // (Check the stored data, not d: emptyCampaignData() already put [] into d.)
  if(!(data && Array.isArray(data.relationMaps))){
    const legacyNodes = d.relationNodes||[], legacyEdges = d.relationEdges||[];
    d.relationMaps = (legacyNodes.length || legacyEdges.length)
      ? [{id:uid(), name:'Beziehungen', nodes:legacyNodes, edges:legacyEdges, layout:d.relationLayout||null}]
      : [];
  }
  delete d.relationNodes; delete d.relationEdges; delete d.relationLayout;
  d.relationMaps = d.relationMaps.map(m=>{
    const nodes = (m.nodes||[]).map(n=>({id:n.id||uid(), name:n.name||'Unbenannt'}));
    const validNodeIds = new Set(nodes.map(n=>n.id));
    const edges = (m.edges||[]).filter(e=>validNodeIds.has(e.from)&&validNodeIds.has(e.to)).map(e=>({
      id: e.id||uid(), from:e.from, to:e.to,
      label: e.label||'kennt', weight: Math.max(1, Math.min(20, parseInt(e.weight,10)||10)),
    }));
    return {id:m.id||uid(), name:m.name||'Beziehungen', nodes, edges, layout:m.layout||null};
  });
  if(!d.relationMaps.some(m=>m.id===d.activeRelationMapId)) d.activeRelationMapId = d.relationMaps[0] ? d.relationMaps[0].id : null;
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
  tableSelectMode:false, selectedTableIds:[], confirmBulkDeleteTables:false, confirmDeleteTableGroup:null, bulkGroupChoice:'', bulkGroupNewName:'',
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
  selectedMapNodeId:null, mapMoveArmedId:null, mapConnectFrom:null, mapPlayConnect:false, mapBrush:null, mapAreaBrush:'', mapEncounterResult:null,
  editingMapId:null, mapNameDraft:'',
  editingMapNodeId:null, mapNodeDraft:null,
  editingMapEdgeId:null, mapEdgeDraft:null,
  showStatblockCharPicker:false, battlePasteOpen:false, battlePasteText:'', battlePasteCount:'', battleEditId:null, battleTarget:{},
  bestiaryOpen:false, bestiaryPick:null, bestiaryQuery:'', bestiaryDice:'', bestiaryCount:'',
  relationsConnectFrom:null, relationRollResult:null,
  editingRelationNodeId:null, relationNodeDraft:null,
  editingRelationEdgeId:null, relationEdgeDraft:null,
  confirmDeleteRelationMapId:null,
  backups:null, confirmRestoreBackupId:null,
};

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
