// Dungeon turn tracker on the Karte tab, switched on per map: 10-minute turns
// and timed effects (torches, lanterns, spell durations) that count down with
// every turn unless paused.

const TURN_PRESETS = [{name:'Fackel', turns:6}, {name:'Laterne', turns:24}];

function emptyTurnTracker(){ return {on:false, turn:0, effects:[]}; }
function normTurnTracker(t){
  t = t || {};
  return {
    on: !!t.on, turn: Math.max(0, parseInt(t.turn,10)||0),
    effects: (t.effects||[]).map(e=>{
      const max = Math.max(1, parseInt(e.max,10)||1);
      return {id:e.id||uid(), name:e.name||'Effekt', max, left: Math.min(max, Math.max(0, parseInt(e.left,10)||0)),
        paused: !!e.paused, outAt: e.outAt!=null ? parseInt(e.outAt,10) : null};
    }),
  };
}
function updateTurnTracker(fn){ updateCurrentMap(m=>({...m, turns: fn(normTurnTracker(m.turns))})); saveState(); render(); }

function toggleTurnTracker(){ updateTurnTracker(t=>({...t, on:!t.on})); }
// Effects that are running lose one turn; outAt remembers when one ran out
// so "Turn zurück" can bring it back.
function advanceTurn(){
  updateTurnTracker(t=>{
    const turn = t.turn+1;
    return {...t, turn, effects: t.effects.map(e=>e.paused || e.left<=0 ? e : {...e, left:e.left-1, outAt: e.left===1 ? turn : null})};
  });
}
function undoTurn(){
  updateTurnTracker(t=>{
    if(t.turn<=0) return t;
    return {...t, turn:t.turn-1, effects: t.effects.map(e=>{
      if(e.paused) return e;
      if(e.left===0) return e.outAt===t.turn ? {...e, left:1, outAt:null} : e;
      return e.left<e.max ? {...e, left:e.left+1} : e;
    })};
  });
}
function resetTurns(){
  if(!confirm('Turn-Zähler auf 0 setzen? Die Effekte bleiben, wie sie sind.')) return;
  updateTurnTracker(t=>({...t, turn:0}));
}
function addTurnEffect(name, turns){
  turns = parseInt(turns,10);
  if(!turns || turns<1) return;
  updateTurnTracker(t=>({...t, effects:[...t.effects, {id:uid(), name:(name||'').trim()||'Effekt', max:turns, left:turns, paused:false, outAt:null}]}));
}
function addCustomTurnEffect(){
  const name = document.getElementById('turnfx-name'), turns = document.getElementById('turnfx-turns');
  if(!parseInt(turns.value,10)){ turns.focus(); return; }
  addTurnEffect(name.value, turns.value);
}
function toggleTurnEffectPause(id){ updateTurnTracker(t=>({...t, effects:t.effects.map(e=>e.id===id ? {...e, paused:!e.paused} : e)})); }
function removeTurnEffect(id){ updateTurnTracker(t=>({...t, effects:t.effects.filter(e=>e.id!==id)})); }
// Fine-tuning by hand, e.g. a spell that turned out to last longer.
function stepTurnEffect(id, d){
  updateTurnTracker(t=>({...t, effects:t.effects.map(e=>e.id!==id ? e : {...e, left:Math.max(0, e.left+d), max:Math.max(e.max, e.left+d), outAt:null})}));
}

function formatTurnTime(turn){
  const h = Math.floor(turn/6), m = (turn%6)*10;
  return h ? `${h} Std${m ? ` ${m} Min` : ''}` : `${m} Min`;
}
function renderTurnEffect(e){
  const out = e.left<=0;
  const bar = e.max<=12
    ? Array.from({length:e.max}, (_,i)=>`<span class="turn-seg${i<e.left?' on':''}"></span>`).join('')
    : `<span class="turn-bar"><span style="width:${Math.round(100*e.left/e.max)}%;"></span></span>`;
  return `<div class="turn-fx${out?' out':''}${e.paused?' paused':''}">
    <span class="turn-fx-name">${escapeHtml(e.name)}</span>
    <span class="turn-fx-bar">${bar}</span>
    <span class="small-muted turn-fx-left">${out ? 'abgelaufen' : `${e.left}/${e.max}${e.paused ? ' · pausiert' : ''}`}</span>
    <span class="row" style="gap:2px;margin-left:auto;">
      <button class="sb-step" onclick="stepTurnEffect('${e.id}',-1)" aria-label="−1">−</button>
      <button class="sb-step" onclick="stepTurnEffect('${e.id}',1)" aria-label="+1">+</button>
      ${out ? '' : `<button class="sb-step" onclick="toggleTurnEffectPause('${e.id}')" title="${e.paused?'Weiterlaufen lassen':'Pausieren'}">${e.paused?'▶':'⏸'}</button>`}
      <button class="x-btn" style="padding:0 4px;" onclick="removeTurnEffect('${e.id}')" title="Entfernen">✕</button>
    </span>
  </div>`;
}
function renderTurnTracker(map){
  const t = normTurnTracker(map.turns);
  if(!t.on) return '';
  const inHour = t.turn%6;
  const boxes = Array.from({length:6}, (_,i)=>`<span class="turn-box${i<inHour?' on':''}"></span>`).join('');
  return `<div class="panel" style="gap:10px;">
    <div class="row between wrap" style="gap:8px;">
      <div class="row" style="gap:10px;align-items:baseline;">
        <span class="label">Turn</span>
        <span style="font-size:20px;color:var(--gold);">${t.turn}</span>
        <span class="small-muted">${formatTurnTime(t.turn)}</span>
      </div>
      <div class="row" style="gap:6px;">
        ${t.turn ? `<button class="icon-btn" style="padding:4px 6px;font-size:14px;" onclick="resetTurns()" title="Zähler zurücksetzen">↺</button>` : ''}
        <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="undoTurn()" title="Turn zurück">−</button>
        <button class="btn btn-gold" style="padding:6px 14px;font-size:13px;" onclick="advanceTurn()">+1 Turn</button>
      </div>
    </div>
    <div class="row" style="gap:6px;"><span class="small-muted" style="width:44px;">Std ${Math.floor(t.turn/6)+1}</span>${boxes}</div>
    <div class="turn-fx-list">
      <span class="label">Effekte</span>
      ${t.effects.map(renderTurnEffect).join('')}
      <div class="row wrap" style="gap:6px;">
        ${TURN_PRESETS.map(p=>`<button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="addTurnEffect('${p.name}',${p.turns})">+ ${p.name} (${p.turns})</button>`).join('')}
        <span class="row" style="gap:4px;flex:1;min-width:200px;">
          <input type="text" id="turnfx-name" placeholder="Effekt, z.B. Zauber" style="flex:1;min-width:0;padding:4px 6px;" onkeydown="if(event.key==='Enter') addCustomTurnEffect();">
          <input type="number" id="turnfx-turns" min="1" placeholder="Turns" style="width:64px;padding:4px 6px;" onkeydown="if(event.key==='Enter') addCustomTurnEffect();">
          <button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="addCustomTurnEffect()">+</button>
        </span>
      </div>
    </div>
  </div>`;
}
