// Time on the Karte tab.
// One clock for the whole campaign (camp.clockMin: minutes since Tag 1, 00:00)
// and the things being tracked (torch, rations, a spell …: camp.tracked) run
// on it, whatever map is open. Each map decides how time moves there
// (map.time):
//  - mode 'turns': "+1 Turn" (length per map, 10 min by default), counted per
//    map, shown as boxes in rows (6 by default);
//  - mode 'clock': step buttons of any length the map defines, plus a free amount.
// Each map also has its own presets of things to track. Every step can be
// taken back (camp.timeUndo holds the state before the last steps).

const TIME_UNDO_MAX = 30;
function clampInt(v, lo, hi, def){ const n = parseInt(v,10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }

// map.time with defaults. Older maps had map.turns (10-minute turns only).
function normMapTime(map){
  const t = map.time || {};
  const old = map.turns || {};
  const mode = t.mode==='clock' || t.mode==='turns' ? t.mode : (map.grid==='hex' && !old.on ? 'clock' : 'turns');
  return {
    on: t.on!=null ? !!t.on : !!old.on,
    mode,
    turnMin: clampInt(t.turnMin, 1, 1e6, 10),
    group: clampInt(t.group, 1, 60, 6),
    turn: Math.max(0, parseInt(t.turn!=null ? t.turn : old.turn, 10) || 0),
    steps: Array.isArray(t.steps)
      ? t.steps.map(s=>({id: s.id||uid(), label: String(s.label||''), min: clampInt(s.min, 1, 1e7, 60)}))
      : [60, 240, 1440].map(min=>({id:uid(), label:'', min})),
    presets: Array.isArray(t.presets)
      ? t.presets.map(p=>({id: p.id||uid(), name: String(p.name||'Effekt'), min: clampInt(p.min, 1, 1e7, 60)}))
      : (mode==='turns' ? [{name:'Fackel', min:60}, {name:'Laterne', min:240}] : []).map(p=>({id:uid(), ...p})),
  };
}
function normTracked(list){
  return (list||[]).map(e=>{
    const max = clampInt(e.max, 1, 1e7, 60);
    return {id: e.id||uid(), name: String(e.name||'Effekt'), max, left: clampInt(e.left, 0, max, max), paused: !!e.paused};
  });
}
// Effects of the old per-map turn tracker (counted in 10-minute turns).
function trackedFromOldTurns(maps){
  const out = [];
  (maps||[]).forEach(m=>((m.turns && m.turns.effects) || []).forEach(e=>{
    const max = Math.max(1, parseInt(e.max,10)||1);
    out.push({id: e.id, name: e.name, max: max*10, left: Math.min(max, Math.max(0, parseInt(e.left,10)||0))*10, paused: !!e.paused});
  }));
  return out;
}

// ---- Durations ----
function fmtClock(min){
  const day = Math.floor(min/1440)+1, m = ((min%1440)+1440)%1440;
  return `Tag ${day} · ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}
// "1 Tag 4 Std", "2 Std 30 Min", "10 Min"
function fmtDur(min){
  const d = Math.floor(min/1440), h = Math.floor((min%1440)/60), m = min%60;
  const parts = [];
  if(d) parts.push(`${d} ${d===1?'Tag':'Tage'}`);
  if(h) parts.push(`${h} Std`);
  if(m || !parts.length) parts.push(`${m} Min`);
  return parts.join(' ');
}
// Short, for chips: "0:40", "3:10", "5 Tage", "1 Tag 4 Std"
function fmtDurShort(min){
  if(min < 1440) return `${Math.floor(min/60)}:${String(min%60).padStart(2,'0')}`;
  return fmtDur(min - min%60);
}
// In turn mode, a duration that fits whole turns is shown in turns.
function fmtDurFor(min, t){
  return t.mode==='turns' && min % t.turnMin===0 ? `${min/t.turnMin} ${min/t.turnMin===1 ? 'Turn' : 'Turns'}` : fmtDur(min);
}
// "45", "45 Min", "2:30", "3 Std", "1,5 Std", "2 Tage", "1 Tag 4 Std", "6 Turns".
// A bare number is turns on a turn map, minutes otherwise. null = not understood.
function parseDur(str, t){
  str = String(str||'').trim().toLowerCase().replace(',', '.');
  if(!str) return null;
  const hm = str.match(/^(\d+):(\d{1,2})$/);
  if(hm) return parseInt(hm[1],10)*60 + parseInt(hm[2],10);
  let total = 0, any = false;
  const re = /(\d+(?:\.\d+)?)\s*([a-zäöü]*)/g;
  let m, rest = str;
  while((m = re.exec(str))){
    if(!m[0]) break;
    const n = parseFloat(m[1]), u = m[2];
    let f;
    if(!u) f = t && t.mode==='turns' ? t.turnMin : 1;
    else if(/^(m|min|mins|minute|minuten)$/.test(u)) f = 1;
    else if(/^(h|std|stunde|stunden)$/.test(u)) f = 60;
    else if(/^(d|t|tag|tage|tagen)$/.test(u)) f = 1440;
    else if(/^(w|wo|woche|wochen)$/.test(u)) f = 10080;
    else if(/^(turn|turns|runde|runden)$/.test(u)) f = t ? t.turnMin : 10;
    else return null;
    total += n*f; any = true;
    rest = rest.replace(m[0], '');
  }
  if(!any || rest.replace(/[\s+und&]/g,'')) return null;
  const r = Math.round(total);
  return r>0 ? r : null;
}

// ---- State changes ----
function curMapTime(){ const m = getCurrentMap(); return m ? normMapTime(m) : null; }
function updateMapTime(fn){
  updateCurrentMap(m=>({...m, time: fn(normMapTime(m))}));
  saveState(); render();
}
function toggleTurnTracker(){ ui.timePop = null; updateMapTime(t=>({...t, on:!t.on})); }
function snapshotTime(camp){
  const m = camp.maps.find(x=>x.id===camp.activeMapId);
  return {clockMin: camp.clockMin, tracked: camp.tracked, mapId: camp.activeMapId, turn: m ? normMapTime(m).turn : 0};
}
// Move the clock on; tracked things that run lose the same time.
function advanceTime(min, countTurn){
  if(!(min>0)) return;
  updateActive(camp=>{
    const maps = countTurn ? camp.maps.map(m=>{ if(m.id!==camp.activeMapId) return m; const t = normMapTime(m); return {...m, time:{...t, turn:t.turn+1}}; }) : camp.maps;
    return {...camp, maps,
      clockMin: camp.clockMin + min,
      tracked: camp.tracked.map(e=>e.paused || e.left<=0 ? e : {...e, left: Math.max(0, e.left-min)}),
      timeUndo: [...camp.timeUndo, snapshotTime(camp)].slice(-TIME_UNDO_MAX)};
  });
  ui.timePop = null;
  saveState(); render();
}
function advanceTurn(){ const t = curMapTime(); if(t) advanceTime(t.turnMin, true); }
function advanceTimeFree(){
  const el = document.getElementById('time-free');
  const min = parseDur(el && el.value, curMapTime());
  if(!min){ if(el){ el.focus(); el.classList.add('bad'); } return; }
  advanceTime(min, false);
}
// Takes the last step back: clock, tracked things and that map's turn count.
function undoTime(){
  updateActive(camp=>{
    const last = camp.timeUndo[camp.timeUndo.length-1];
    if(!last) return camp;
    const maps = camp.maps.map(m=>m.id===last.mapId ? {...m, time:{...normMapTime(m), turn:last.turn}} : m);
    return {...camp, maps, clockMin:last.clockMin, tracked:last.tracked, timeUndo: camp.timeUndo.slice(0,-1)};
  });
  ui.timePop = null;
  saveState(); render();
}
function setCampaignClock(){
  const day = parseInt((document.getElementById('clock-day')||{}).value, 10);
  const hm = String((document.getElementById('clock-time')||{}).value||'').match(/^(\d{1,2}):(\d{2})$/);
  if(!(day>=1) || !hm || +hm[1]>23 || +hm[2]>59){ showToast('Tag ≥ 1 und Uhrzeit wie 14:20'); return; }
  updateActive(camp=>({...camp, clockMin: (day-1)*1440 + (+hm[1])*60 + (+hm[2])}));
  ui.timePop = null;
  saveState(); render();
}
function resetMapTurns(){
  if(!confirm('Turn-Zähler dieser Karte auf 0 setzen? Uhr und Verfolgtes bleiben, wie sie sind.')) return;
  updateMapTime(t=>({...t, turn:0}));
}

// Tracked things
function updateTracked(fn){ updateActive(camp=>({...camp, tracked: fn(camp.tracked)})); saveState(); render(); }
function addTracked(name, min){
  if(!(min>0)) return;
  ui.timePop = null;
  updateTracked(list=>[...list, {id:uid(), name:(name||'').trim()||'Effekt', max:min, left:min, paused:false}]);
}
function addTrackedPreset(id){ const p = (curMapTime()||{presets:[]}).presets.find(x=>x.id===id); if(p) addTracked(p.name, p.min); }
function addTrackedCustom(){
  const name = document.getElementById('track-name'), dur = document.getElementById('track-dur');
  const min = parseDur(dur && dur.value, curMapTime());
  if(!min){ if(dur){ dur.focus(); dur.classList.add('bad'); } return; }
  addTracked(name ? name.value : '', min);
}
function stepTracked(id, d){ updateTracked(list=>list.map(e=>e.id!==id ? e : {...e, left: Math.max(0, e.left+d), max: Math.max(e.max, e.left+d)})); }
function toggleTrackedPause(id){ updateTracked(list=>list.map(e=>e.id===id ? {...e, paused:!e.paused} : e)); }
function removeTracked(id){ ui.timePop = null; updateTracked(list=>list.filter(e=>e.id!==id)); }
function toggleTimePop(what){ ui.timePop = ui.timePop===what ? null : what; render(); }

// Settings of the map (edit mode)
function setTimeMode(mode){ updateMapTime(t=>({...t, mode})); }
function onTimeDurInput(el, field){
  const t = curMapTime();
  const min = parseDur(el.value, field==='turnMin' ? {mode:'clock'} : t);
  if(!min){ el.classList.add('bad'); return; }
  updateMapTime(x=>({...x, [field]:min}));
}
function onTimeGroupInput(el){ updateMapTime(t=>({...t, group: clampInt(el.value, 1, 60, t.group)})); }
function addTimeStep(){ updateMapTime(t=>({...t, steps:[...t.steps, {id:uid(), label:'', min:60}]})); }
function removeTimeStep(id){ updateMapTime(t=>({...t, steps:t.steps.filter(s=>s.id!==id)})); }
function onTimeStepLabel(id, el){ updateCurrentMap(m=>{ const t = normMapTime(m); return {...m, time:{...t, steps:t.steps.map(s=>s.id===id ? {...s, label:el.value} : s)}}; }); saveState(); }
function onTimeStepDur(id, el){
  const min = parseDur(el.value, {mode:'clock'});
  if(!min){ el.classList.add('bad'); return; }
  updateMapTime(t=>({...t, steps:t.steps.map(s=>s.id===id ? {...s, min} : s)}));
}
function addTimePreset(){ const t = curMapTime(); updateMapTime(x=>({...x, presets:[...x.presets, {id:uid(), name:'', min: x.mode==='turns' ? x.turnMin*6 : 1440}]})); }
function removeTimePreset(id){ updateMapTime(t=>({...t, presets:t.presets.filter(p=>p.id!==id)})); }
function onTimePresetName(id, el){ updateCurrentMap(m=>{ const t = normMapTime(m); return {...m, time:{...t, presets:t.presets.map(p=>p.id===id ? {...p, name:el.value} : p)}}; }); saveState(); }
function onTimePresetDur(id, el){
  const min = parseDur(el.value, curMapTime());
  if(!min){ el.classList.add('bad'); return; }
  updateMapTime(t=>({...t, presets:t.presets.map(p=>p.id===id ? {...p, min} : p)}));
}

// ---- Views ----
// The strip above the map: turns (or clock), tracked things, the step buttons.
function renderTimeStrip(map){
  const t = normMapTime(map);
  if(!t.on) return '';
  const camp = getActive();
  const turns = t.mode==='turns';
  // In turns only what lasts a few turns (torch 4/6); rations etc. as time.
  const inTurns = e => turns && e.max % t.turnMin===0 && e.max/t.turnMin <= 60;
  const left = e => inTurns(e) ? `${Math.ceil(e.left/t.turnMin)}/${e.max/t.turnMin}` : fmtDurShort(e.left);
  const chips = camp.tracked.map(e=>`<button class="time-fx ${e.left<=0?'out':''} ${e.paused?'paused':''} ${ui.timePop==='fx:'+e.id?'on':''}" onclick="toggleTimePop('fx:${e.id}')">
      <span>${escapeHtml(e.name)}</span><span class="time-fx-bar"><i style="width:${Math.round(100*e.left/e.max)}%"></i></span><span class="time-fx-left">${e.left<=0 ? 'aus' : left(e)}${e.paused ? ' · Pause' : ''}</span>
    </button>`).join('')
    + `<button class="time-fx add ${ui.timePop==='add'?'on':''}" onclick="toggleTimePop('add')">+ Verfolgen</button>`;
  const undo = `<button class="btn btn-raised time-btn" onclick="undoTime()" ${camp.timeUndo.length?'':'disabled style="opacity:.4;"'} title="Letzten Schritt zurücknehmen">${turns ? '−' : '↶'}</button>`;
  let main, btns;
  if(turns){
    const inRow = t.turn % t.group;
    const boxes = Array.from({length:t.group}, (_,i)=>`<span class="turn-box${i<inRow?' on':''}"></span>`).join('');
    main = `<span class="label">Turn</span><span class="time-big">${t.turn}</span><span class="turn-boxes">${boxes}</span>`;
    btns = `${undo}<button class="btn btn-gold time-btn" onclick="advanceTurn()">+1 Turn</button>`;
  } else {
    main = `<button class="time-big time-clock ${ui.timePop==='clock'?'on':''}" onclick="toggleTimePop('clock')" title="Tag und Uhrzeit ändern">${fmtClock(camp.clockMin)}</button>`;
    btns = t.steps.map(s=>`<button class="btn btn-raised time-btn time-step" onclick="advanceTime(${s.min})">${escapeHtml(s.label ? s.label : '+'+fmtDur(s.min))}</button>`).join('')
      + `<button class="btn btn-raised time-btn ${ui.timePop==='free'?'active':''}" onclick="toggleTimePop('free')" title="Beliebige Zeit vorstellen">+ …</button>${undo}`;
  }
  return `<div class="time-strip">
    <div class="time-main">${main}</div>
    <div class="time-fxs">${chips}</div>
    <div class="time-btns">${btns}</div>
    ${renderTimePop(t, camp)}
  </div>`;
}
function renderTimePop(t, camp){
  const p = ui.timePop;
  if(!p) return '';
  const turns = t.mode==='turns';
  let inner = '';
  if(p==='add'){
    inner = `${t.presets.length ? `<span class="label">Vorlagen dieser Karte</span>
      <div class="row wrap" style="gap:6px;">${t.presets.map(x=>`<button class="btn btn-raised time-btn" onclick="addTrackedPreset('${x.id}')">${escapeHtml(x.name)} · ${fmtDurFor(x.min, t)}</button>`).join('')}</div>` : `<span class="small-muted">Noch keine Vorlagen – im Bearbeiten-Modus unter „Zeit“ anlegen.</span>`}
      <span class="label">Einmalig</span>
      <div class="row" style="gap:6px;">
        <input type="text" id="track-name" placeholder="Name, z.B. Schutzzauber" style="flex:1;min-width:0;" onkeydown="if(event.key==='Enter') addTrackedCustom();">
        <input type="text" id="track-dur" placeholder="${turns ? 'Turns' : 'z.B. 2 Std'}" style="width:96px;" onkeydown="if(event.key==='Enter') addTrackedCustom();">
        <button class="btn btn-gold time-btn" onclick="addTrackedCustom()">+</button>
      </div>`;
  } else if(p.startsWith('fx:')){
    const e = camp.tracked.find(x=>x.id===p.slice(3));
    if(!e){ ui.timePop = null; return ''; }
    const d = turns ? t.turnMin : 10;
    inner = `<span class="label">${escapeHtml(e.name)} · noch ${fmtDurFor(e.left, t)} von ${fmtDurFor(e.max, t)}</span>
      <div class="row wrap" style="gap:6px;">
        <button class="btn btn-raised time-btn" onclick="stepTracked('${e.id}',-${d})">− ${fmtDurFor(d, t)}</button>
        <button class="btn btn-raised time-btn" onclick="stepTracked('${e.id}',${d})">+ ${fmtDurFor(d, t)}</button>
        ${turns ? '' : `<button class="btn btn-raised time-btn" onclick="stepTracked('${e.id}',-60)">− 1 Std</button><button class="btn btn-raised time-btn" onclick="stepTracked('${e.id}',60)">+ 1 Std</button>`}
        <button class="btn btn-raised time-btn" onclick="toggleTrackedPause('${e.id}')">${e.paused ? 'Weiterlaufen' : 'Pausieren'}</button>
        <button class="btn btn-outline-wax time-btn" onclick="removeTracked('${e.id}')">Entfernen</button>
      </div>`;
  } else if(p==='free'){
    inner = `<span class="label">Zeit vorstellen</span>
      <div class="row" style="gap:6px;">
        <input type="text" id="time-free" placeholder="z.B. 45 Min, 2:30, 3 Std, 2 Tage" style="flex:1;min-width:0;" onkeydown="if(event.key==='Enter') advanceTimeFree();">
        <button class="btn btn-gold time-btn" onclick="advanceTimeFree()">Vorstellen</button>
      </div>`;
  } else if(p==='clock'){
    inner = renderClockEdit(camp);
  }
  return `<div class="time-pop">${inner}</div>`;
}
function renderClockEdit(camp){
  const day = Math.floor(camp.clockMin/1440)+1, m = camp.clockMin%1440;
  const hm = `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  return `<span class="label">Kampagnen-Uhr</span>
    <div class="row wrap" style="gap:6px;align-items:center;">
      <span class="small-muted">Tag</span><input type="number" id="clock-day" min="1" value="${day}" style="width:72px;">
      <input type="text" id="clock-time" value="${hm}" placeholder="14:20" style="width:80px;" onkeydown="if(event.key==='Enter') setCampaignClock();">
      <button class="btn btn-gold time-btn" onclick="setCampaignClock()">Setzen</button>
    </div>`;
}
// Settings in edit mode (column next to the map).
function renderTimeSettings(map){
  const t = normMapTime(map), camp = getActive();
  const turns = t.mode==='turns';
  const modeBtn = (m, label) => `<button style="padding:6px 10px;font-size:12px;${t.mode===m?'background:var(--gold);color:var(--bg);':''}" onclick="setTimeMode('${m}')">${label}</button>`;
  return `<details class="map-fold" ${ui.timeSettingsOpen?'open':''} ontoggle="ui.timeSettingsOpen=this.open">
    <summary class="label">Zeit</summary>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
      <div class="row wrap" style="gap:8px;align-items:center;">
        <span class="small-muted">Zählen in</span>
        <div class="mode-toggle" style="width:auto;">${modeBtn('turns','Turns')}${modeBtn('clock','Uhrzeit')}</div>
      </div>
      ${turns ? `<div class="row wrap" style="gap:8px;align-items:center;">
          <span class="small-muted">1 Turn =</span><input type="text" value="${fmtDur(t.turnMin)}" onchange="onTimeDurInput(this,'turnMin')" style="width:100px;">
          <span class="small-muted">Kästchen pro Reihe</span><input type="number" min="1" max="60" value="${t.group}" onchange="onTimeGroupInput(this)" style="width:64px;">
        </div>
        <div class="row wrap" style="gap:8px;align-items:center;">
          <span class="small-muted">Turn ${t.turn} auf dieser Karte</span>
          ${t.turn ? `<button class="link-chip" onclick="resetMapTurns()">auf 0 setzen</button>` : ''}
        </div>` : `<span class="small-muted">Schritt-Knöpfe (Name optional)</span>
        ${t.steps.map(s=>`<div class="row" style="gap:6px;">
          <input type="text" value="${escapeHtml(s.label)}" placeholder="+${fmtDur(s.min)}" oninput="onTimeStepLabel('${s.id}',this)" onchange="render()" style="flex:1;min-width:0;">
          <input type="text" value="${fmtDur(s.min)}" onchange="onTimeStepDur('${s.id}',this)" style="width:110px;">
          <button class="x-btn" onclick="removeTimeStep('${s.id}')" title="Knopf entfernen">✕</button>
        </div>`).join('')}
        <button class="btn btn-raised" style="padding:5px 10px;font-size:12px;align-self:flex-start;" onclick="addTimeStep()">+ Knopf</button>`}
      <span class="small-muted">Vorlagen zum Verfolgen</span>
      ${t.presets.map(p=>`<div class="row" style="gap:6px;">
        <input type="text" value="${escapeHtml(p.name)}" placeholder="Name, z.B. Fackel" oninput="onTimePresetName('${p.id}',this)" onchange="render()" style="flex:1;min-width:0;">
        <input type="text" value="${fmtDurFor(p.min, t)}" onchange="onTimePresetDur('${p.id}',this)" style="width:110px;">
        <button class="x-btn" onclick="removeTimePreset('${p.id}')" title="Vorlage entfernen">✕</button>
      </div>`).join('')}
      <button class="btn btn-raised" style="padding:5px 10px;font-size:12px;align-self:flex-start;" onclick="addTimePreset()">+ Vorlage</button>
      <span class="small-muted">Dauer z.B. 10 Min, 2:30, 4 Std, 7 Tage${turns ? ', 6 Turns (Zahl allein = Turns)' : ''}. Die Uhr gilt für die ganze Kampagne: ${fmtClock(camp.clockMin)}.</span>
      ${renderClockEdit(camp)}
    </div>
  </details>`;
}
