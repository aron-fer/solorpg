// Time on the Karte tab, counted abstractly – no clock, no minutes.
// Each map counts in its own unit ("Turn", "Wache", …) and shows the current
// block of boxes (6 by default), like a paper turn tracker:
//  - recurring events (W every 2, R every 6 …) as letters above the boxes;
//  - countdowns (torch, light spell …) that count up with every unit
//    (1/6, 2/6 … 6/6 and stay there); where one ends in the shown block,
//    its letter stands above that box.
// Everything lives in map.time; every step can be taken back.

const TIME_UNDO_MAX = 30;
function clampInt(v, lo, hi, def){ const n = parseInt(v,10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
function letterOf(s, name){ const l = String(s||'').trim().slice(0,2).toUpperCase(); return l || String(name||'?').trim().charAt(0).toUpperCase() || '?'; }

// map.time with defaults. Takes over the earlier versions: map.turns
// (10-minute turns) and map.time with minutes (turnMin, presets in min).
function normMapTime(map){
  const t = map.time || {};
  const old = map.turns || {};
  const hex = map.grid==='hex';
  const perUnit = t.turnMin>0 ? t.turnMin : 10;            // minutes of the old model
  const toUnits = min => Math.max(1, Math.round((parseInt(min,10)||0)/perUnit));
  const fresh = !map.time && !map.turns;
  return {
    on: t.on!=null ? !!t.on : !!old.on,
    unit: String(t.unit || (fresh && hex ? 'Wache' : 'Turn')),
    group: clampInt(t.group, 1, 60, 6),
    blockName: String(t.blockName!=null ? t.blockName : (fresh && hex ? 'Tag' : '')),
    turn: Math.max(0, parseInt(t.turn!=null ? t.turn : old.turn, 10) || 0),
    events: Array.isArray(t.events)
      ? t.events.map(e=>({id: e.id||uid(), letter: letterOf(e.letter, e.name), name: String(e.name||''), every: clampInt(e.every, 1, 999, 2)}))
      : (hex ? [] : [{letter:'W', name:'Begegnungsprüfung', every:2}, {letter:'R', name:'Rast', every:6}]).map(e=>({id:uid(), ...e})),
    presets: Array.isArray(t.presets)
      ? t.presets.map(p=>({id: p.id||uid(), letter: letterOf(p.letter, p.name), name: String(p.name||''), len: p.len>0 ? clampInt(p.len, 1, 9999, 6) : toUnits(p.min)}))
      : (hex ? [] : [{letter:'T', name:'Fackel', len:6}, {letter:'L', name:'Laterne', len:24}]).map(p=>({id:uid(), ...p})),
    countdowns: (Array.isArray(t.countdowns) ? t.countdowns : (old.effects||[]).map(e=>{
        // old effects counted down in turns: left of max
        const max = Math.max(1, parseInt(e.max,10)||1), left = Math.min(max, Math.max(0, parseInt(e.left,10)||0));
        return {name:e.name, len:max, count: Math.min(max, max-left+1), paused:e.paused};
      })).map(c=>{
        const len = clampInt(c.len, 1, 9999, 6);
        return {id: c.id||uid(), letter: letterOf(c.letter, c.name), name: String(c.name||'Countdown'), len, count: clampInt(c.count, 1, len, 1), paused: !!c.paused};
      }),
    undo: Array.isArray(t.undo) ? t.undo.slice(-TIME_UNDO_MAX) : [],
  };
}
// The campaign-wide clock of the previous version (tracked things in
// minutes) goes to the active map as countdowns, once.
function migrateCampaignClock(d, data){
  if(!data || !Array.isArray(data.tracked)) return;
  const map = d.maps.find(m=>m.id===d.activeMapId);
  if(map && data.tracked.length){
    const per = (data.maps||[]).find(m=>m.id===map.id);
    const turnMin = per && per.time && per.time.turnMin>0 ? per.time.turnMin : 10;
    const add = data.tracked.map(e=>{
      const len = Math.max(1, Math.round((e.max||0)/turnMin)), left = Math.round((e.left||0)/turnMin);
      return {id:uid(), letter: letterOf('', e.name), name: e.name||'Countdown', len, count: Math.min(len, Math.max(1, len-left+1)), paused: !!e.paused};
    });
    map.time = {...map.time, countdowns: [...map.time.countdowns, ...add]};
  }
  delete d.clockMin; delete d.tracked; delete d.timeUndo;
}

// ---- State changes ----
function curMapTime(){ const m = getCurrentMap(); return m ? normMapTime(m) : null; }
function updateMapTime(fn){
  updateCurrentMap(m=>({...m, time: fn(normMapTime(m))}));
  saveState(); render();
}
// A step that can be taken back: the state before it goes on the undo stack.
function stepMapTime(fn){
  updateMapTime(t=>({...fn(t), undo: [...t.undo, {turn:t.turn, countdowns:t.countdowns}].slice(-TIME_UNDO_MAX)}));
}
function toggleTurnTracker(){ ui.timePop = null; updateMapTime(t=>({...t, on:!t.on})); }
function advanceTurn(){
  ui.timePop = null;
  stepMapTime(t=>({...t, turn: t.turn+1, countdowns: t.countdowns.map(c=>c.paused ? c : {...c, count: Math.min(c.len, c.count+1)})}));
}
function undoTurn(){
  ui.timePop = null;
  updateMapTime(t=>{
    const last = t.undo[t.undo.length-1];
    return last ? {...t, turn:last.turn, countdowns:last.countdowns, undo:t.undo.slice(0,-1)} : t;
  });
}
function resetMapTurns(){
  if(!confirm('Zähler dieser Karte auf 0 setzen? Die Countdowns bleiben, wie sie sind.')) return;
  updateMapTime(t=>({...t, turn:0, undo:[]}));
}
// Countdowns
function addCountdown(letter, name, len){
  if(!(len>0)) return;
  ui.timePop = null;
  updateMapTime(t=>({...t, countdowns:[...t.countdowns, {id:uid(), letter:letterOf(letter, name), name:(name||'').trim()||'Countdown', len, count:1, paused:false}]}));
}
function addCountdownPreset(id){ const p = (curMapTime()||{presets:[]}).presets.find(x=>x.id===id); if(p) addCountdown(p.letter, p.name, p.len); }
function addCountdownCustom(){
  const name = document.getElementById('cd-name'), len = document.getElementById('cd-len');
  const n = parseInt(len && len.value, 10);
  if(!(n>0)){ if(len){ len.focus(); len.classList.add('bad'); } return; }
  addCountdown('', name ? name.value : '', n);
}
function updateCountdown(id, fn){ updateMapTime(t=>({...t, countdowns:t.countdowns.map(c=>c.id===id ? fn(c) : c)})); }
function stepCountdown(id, d){ updateCountdown(id, c=>({...c, count: Math.min(c.len, Math.max(1, c.count+d))})); }
function toggleCountdownPause(id){ updateCountdown(id, c=>({...c, paused:!c.paused})); }
function removeCountdown(id){ ui.timePop = null; updateMapTime(t=>({...t, countdowns:t.countdowns.filter(c=>c.id!==id)})); }
function toggleTimePop(what){ ui.timePop = ui.timePop===what ? null : what; render(); }
function showTimeLetters(text){ showToast(text); }

// Settings (edit mode)
function onTimeField(field, el){
  const v = field==='group' ? clampInt(el.value, 1, 60, 6) : el.value;
  updateCurrentMap(m=>({...m, time:{...normMapTime(m), [field]:v}})); saveState();
}
function addTimeItem(list){
  updateMapTime(t=>({...t, [list]:[...t[list], list==='events' ? {id:uid(), letter:'', name:'', every:2} : {id:uid(), letter:'', name:'', len:6}]}));
}
function removeTimeItem(list, id){ updateMapTime(t=>({...t, [list]:t[list].filter(x=>x.id!==id)})); }
function onTimeItem(list, id, field, el){
  const v = field==='every' || field==='len' ? clampInt(el.value, 1, 9999, 1) : (field==='letter' ? el.value.trim().slice(0,2).toUpperCase() : el.value);
  updateCurrentMap(m=>{ const t = normMapTime(m); return {...m, time:{...t, [list]:t[list].map(x=>x.id===id ? {...x, [field]:v} : x)}}; });
  saveState();
}

// ---- Views ----
// The strip above the map: count, the current block with its letters,
// the countdowns.
function renderTimeStrip(map){
  const t = normMapTime(map);
  if(!t.on) return '';
  const next = t.turn + 1;                          // the box being played now
  const start = Math.floor((next-1)/t.group)*t.group + 1;
  const boxes = [];
  for(let n=start; n<start+t.group; n++){
    const ev = t.events.filter(e=>n % e.every===0);
    const ends = t.countdowns.filter(c=>!c.paused && c.count<c.len && n===t.turn+1+(c.len-c.count));
    const title = [...ev.map(e=>`${e.letter}: ${e.name||'Ereignis'}`), ...ends.map(c=>`${c.letter}: ${c.name} endet`)].join(' · ');
    boxes.push(`<div class="tt-cell">
      <button class="tt-mk" ${title ? `title="${escapeHtml(title)}" onclick="showTimeLetters(${jsStr(title)})"` : 'tabindex="-1"'}>${ev.map(e=>escapeHtml(e.letter)).join('')}${ends.map(c=>`<span class="tt-end">${escapeHtml(c.letter)}</span>`).join('')}</button>
      <span class="tt-box ${n<=t.turn?'on':''} ${n===next?'now':''}"></span>
    </div>`);
  }
  const chips = t.countdowns.map(c=>`<button class="time-fx ${c.paused?'paused':''} ${ui.timePop==='cd:'+c.id?'on':''}" onclick="toggleTimePop('cd:${c.id}')">
      <span>${escapeHtml(c.name)}</span><span class="time-fx-bar"><i style="width:${Math.round(100*c.count/c.len)}%"></i></span><span class="time-fx-left">${c.count}/${c.len}${c.paused ? ' · Pause' : ''}</span>
    </button>`).join('')
    + `<button class="time-fx add ${ui.timePop==='add'?'on':''}" onclick="toggleTimePop('add')">+ Countdown</button>`;
  const block = t.blockName.trim() ? `<span class="label">· ${escapeHtml(t.blockName.trim())} ${Math.floor(t.turn/t.group)+1}</span>` : '';
  return `<div class="time-strip">
    <div class="time-main"><span class="label">${escapeHtml(t.unit||'Turn')}</span><span class="time-big">${t.turn}</span>${block}</div>
    <div class="time-btns">
      <button class="btn btn-raised time-btn" onclick="undoTurn()" ${t.undo.length?'':'disabled style="opacity:.4;"'} title="Letzten Schritt zurücknehmen">−</button>
      <button class="btn btn-gold time-btn" onclick="advanceTurn()">+1 ${escapeHtml(t.unit||'Turn')}</button>
    </div>
    <div class="tt-block">${boxes.join('')}</div>
    <div class="time-fxs">${chips}</div>
    ${renderTimePop(t)}
  </div>`;
}
function renderTimePop(t){
  const p = ui.timePop;
  if(!p) return '';
  let inner = '';
  if(p==='add'){
    inner = `${t.presets.length ? `<span class="label">Vorlagen</span>
      <div class="row wrap" style="gap:6px;">${t.presets.map(x=>`<button class="btn btn-raised time-btn" onclick="addCountdownPreset('${x.id}')">${escapeHtml(x.name||x.letter)} · ${x.len}</button>`).join('')}</div>` : `<span class="small-muted">Noch keine Vorlagen – im Bearbeiten-Modus unter „Zeit“ anlegen.</span>`}
      <span class="label">Einmalig</span>
      <div class="row" style="gap:6px;">
        <input type="text" id="cd-name" placeholder="Name, z.B. Trank" style="flex:1;min-width:0;" onkeydown="if(event.key==='Enter') addCountdownCustom();">
        <input type="number" id="cd-len" min="1" placeholder="${escapeHtml(t.unit||'Turn')}s" style="width:86px;" onkeydown="if(event.key==='Enter') addCountdownCustom();">
        <button class="btn btn-gold time-btn" onclick="addCountdownCustom()">+</button>
      </div>`;
  } else if(p.startsWith('cd:')){
    const c = t.countdowns.find(x=>x.id===p.slice(3));
    if(!c){ ui.timePop = null; return ''; }
    inner = `<span class="label">${escapeHtml(c.name)} · ${c.count} von ${c.len}</span>
      <div class="row wrap" style="gap:6px;">
        <button class="btn btn-raised time-btn" onclick="stepCountdown('${c.id}',-1)">−1</button>
        <button class="btn btn-raised time-btn" onclick="stepCountdown('${c.id}',1)">+1</button>
        <button class="btn btn-raised time-btn" onclick="toggleCountdownPause('${c.id}')">${c.paused ? 'Weiterlaufen' : 'Pausieren'}</button>
        <button class="btn btn-outline-wax time-btn" onclick="removeCountdown('${c.id}')">Entfernen</button>
      </div>`;
  }
  return `<div class="time-pop">${inner}</div>`;
}
// Settings in edit mode (column next to the map).
function renderTimeSettings(map){
  const t = normMapTime(map);
  const item = (list, x, numField, numLabel) => `<div class="row" style="gap:6px;">
      <input type="text" value="${escapeHtml(x.letter)}" maxlength="2" oninput="onTimeItem('${list}','${x.id}','letter',this)" onchange="render()" style="width:40px;text-align:center;" title="Buchstabe über dem Kästchen">
      <input type="text" value="${escapeHtml(x.name)}" placeholder="Name" oninput="onTimeItem('${list}','${x.id}','name',this)" onchange="render()" style="flex:1;min-width:0;">
      ${numLabel ? `<span class="small-muted">${numLabel}</span>` : ''}
      <input type="number" min="1" value="${x[numField]}" onchange="onTimeItem('${list}','${x.id}','${numField}',this); render();" style="width:60px;">
      <button class="x-btn" onclick="removeTimeItem('${list}','${x.id}')" title="Entfernen">✕</button>
    </div>`;
  return `<details class="map-fold" ${ui.timeSettingsOpen?'open':''} ontoggle="ui.timeSettingsOpen=this.open">
    <summary class="label">Zeit</summary>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
      <div class="row wrap" style="gap:6px;align-items:center;">
        <span class="small-muted">Einheit</span><input type="text" value="${escapeHtml(t.unit)}" oninput="onTimeField('unit',this)" onchange="render()" style="width:100px;">
        <span class="small-muted">pro Block</span><input type="number" min="1" max="60" value="${t.group}" onchange="onTimeField('group',this); render();" style="width:60px;">
      </div>
      <div class="row wrap" style="gap:6px;align-items:center;">
        <span class="small-muted">Block heißt</span><input type="text" value="${escapeHtml(t.blockName)}" placeholder="(leer)" oninput="onTimeField('blockName',this)" onchange="render()" style="width:100px;">
        <span class="small-muted">z.B. „Tag“ bei Wachen</span>
      </div>
      <span class="label">Wiederkehrend</span>
      ${t.events.map(e=>item('events', e, 'every', 'alle')).join('')}
      <button class="btn btn-raised" style="padding:5px 10px;font-size:12px;align-self:flex-start;" onclick="addTimeItem('events')">+ Ereignis</button>
      <span class="label">Countdown-Vorlagen</span>
      ${t.presets.map(p=>item('presets', p, 'len', '')).join('')}
      <button class="btn btn-raised" style="padding:5px 10px;font-size:12px;align-self:flex-start;" onclick="addTimeItem('presets')">+ Vorlage</button>
      <div class="row wrap" style="gap:8px;align-items:center;">
        <span class="small-muted">Zähler steht auf ${t.turn}</span>
        ${t.turn ? `<button class="link-chip" onclick="resetMapTurns()">auf 0 setzen</button>` : ''}
      </div>
    </div>
  </details>`;
}
