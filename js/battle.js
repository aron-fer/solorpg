// Kampf tab: party (linked to the character sheets) and enemy groups with
// OSR/Hyperborea-style statblocks ("Ape-Man: #E 1d6 | AL N | … | Special: …")
// and one HP pair per creature.

function updateStatblock(id, fn){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id===id ? fn(sb) : sb)}));
}

// ---- Round & initiative ----
function nextBattleRound(){ updateActive(camp=>({...camp, battleRound:(camp.battleRound||1)+1})); saveState(); render(); }
function resetBattleRound(){ updateActive(camp=>({...camp, battleRound:1})); saveState(); render(); }
function rollSideInitiative(){
  const party = rollDie(6), enemies = rollDie(6);
  const who = party>enemies ? 'Party zuerst' : enemies>party ? 'Gegner zuerst' : 'Gleichzeitig';
  pushLog(`Initiative (Runde ${getActive().battleRound}): Party d6→${party} · Gegner d6→${enemies} — ${who}`, 'battle');
  render();
}

// ---- Party ----
function toggleStatblockCharPicker(){ ui.showStatblockCharPicker = !ui.showStatblockCharPicker; render(); }
function addStatblockFromCharacter(charId){
  const c = getActive().characters.find(x=>x.id===charId);
  if(!c) return;
  updateActive(camp=>({...camp, statblocks:[...camp.statblocks, {id:uid(), kind:'pc', charId, name:c.name, notes:'', stats:[], specials:'', members:[], statuses:[]}]}));
  ui.showStatblockCharPicker = false;
  saveState(); render();
}
// Statblock placement of a character's fields; sheets that were never set up
// for the statblock fall back to the name-based suggestions.
function sbEffective(c){
  const configured = c.sections.some(s=>s.sb || s.fields.some(f=>f.sb));
  const out = [];
  c.sections.forEach(section=>section.fields.forEach(f=>{
    const sug = configured ? null : suggestSbFor(section, f);
    const sb = configured ? f.sb : (sug && sug.sb);
    if(sb) out.push({section, f, sb, label: configured ? sbLabel(f) : ((sug.sbAbbr||'').trim() || sbDefaultAbbr(f.name))});
  }));
  return out;
}
function battleCounter(c, section, f){
  const a = `'${section.id}','${f.id}'`;
  return [`<button class="sb-step" onclick="incrementFieldCounter(${a},-1,'${c.id}')" aria-label="−1">−</button>`,
          `<button class="sb-step" onclick="incrementFieldCounter(${a},1,'${c.id}')" aria-label="+1">+</button>`];
}
function renderPartyRow(sb){
  const c = getActive().characters.find(x=>x.id===sb.charId);
  if(!c) return `<div class="panel battle-row"><span class="small-muted">Charakter „${escapeHtml(sb.name)}" gibt es nicht mehr.</span><button class="x-btn" onclick="deleteStatblock('${sb.id}')">✕</button></div>`;
  const eff = sbEffective(c);
  const head = new Map();
  eff.filter(e=>e.sb==='head').forEach(e=>{ if(!head.has(e.label)) head.set(e.label, []); head.get(e.label).push(e); });
  const headHtml = [...head.entries()].map(([k, parts])=>{
    const counter = parts.find(p=>p.f.type==='counter');
    const vals = parts.map(p=>p===counter ? `<b>${escapeHtml(p.f.value)}</b>` : `<span class="${p===parts[0]?'':'sb-lbl'}">${escapeHtml(sbIsEmpty(p.f.value)?'–':p.f.value)}</span>`).join('<span class="sb-lbl">/</span>');
    if(counter){ const [m,p] = battleCounter(c, counter.section, counter.f); return `<span class="sb-head-item sb-boxed">${m}<span><span class="sb-lbl">${escapeHtml(k)}</span> ${vals}</span>${p}</span>`; }
    return `<span class="sb-head-item"><span class="sb-lbl">${escapeHtml(k)}</span> <b>${vals}</b></span>`;
  }).join('');
  // Things that run out during a fight: ammo-like counters and spells.
  const extras = eff.filter(e=>e.sb==='line' && e.f.type==='counter').map(e=>{
    const [m,p] = battleCounter(c, e.section, e.f);
    return `<span class="sb-head-item"><span class="sb-lbl">${escapeHtml(e.label)}</span>${m}<b>${escapeHtml(e.f.value)}</b>${p}</span>`;
  });
  c.sections.forEach(s=>s.fields.filter(f=>f.type==='spells').forEach(f=>{
    const v = normSpellValue(f.value);
    const ready = v.levels.reduce((n,l)=>n+l.prepared.filter(p=>!p.cast).length,0), total = v.levels.reduce((n,l)=>n+l.slots,0);
    if(total) extras.push(`<button class="sb-head-item" onclick="openCharacterStatblock('${c.id}')" title="Zum Statblock"><span class="sb-lbl">Spells</span> <b>${ready}</b><span class="sb-lbl">/${total}</span></button>`);
  }));
  return `<div class="panel battle-row">
    <div class="sb-head" style="padding:0;">
      <button class="sb-name" style="font-size:16px;text-align:left;" onclick="openCharacterStatblock('${c.id}')" title="Statblock öffnen">${escapeHtml(c.name)}</button>
      ${headHtml || '<span class="small-muted">Keine Kopfzeile — im Charakter-Statblock einrichten.</span>'}
      ${extras.join('')}
      ${ui.managing ? `<button class="x-btn sb-edit" onclick="deleteStatblock('${sb.id}')" title="Aus dem Kampf nehmen">✕</button>` : ''}
    </div>
  </div>`;
}
function openCharacterStatblock(charId){
  updateActive(camp=>({...camp, activeCharacterId:charId}));
  ui.characterViewMode = 'statblock';
  saveState();
  if(typeof setActiveTab==='function') setActiveTab('character'); else { ui.activeTab='character'; render(); }
}

// ---- Enemy statblock parsing ----
const SB_KEYS = ['#E','AL','SZ','MV','DX','AC','HD','#A','D','SV','ML','XP','TC'];
// "Ape-Man: #E 1d6 (6d6) | AL N | … | XP 24* | TC L | Special: Climb: …"
function parseEnemyStatblock(raw){
  let text = String(raw||'').replace(/\r/g,'')
    .replace(/(\w)-\n\s*(\w)/g,'$1$2');      // hyphenated line breaks from the PDF
  let name = '', specials = '';
  // Specials keep their line breaks (one ability per line, "• Climb: …");
  // wrapped lines that don't start a new ability are joined.
  const sp = text.match(/\|?\s*Special:\s*([\s\S]*)$/i);
  if(sp){
    specials = sp[1].split('\n').map(l=>l.trim()).filter(Boolean)
      .reduce((out,l)=>{ if(out.length && !/^(•|[-*]\s|[A-Z][\w'’ -]{1,30}:)/.test(l)) out[out.length-1] += ' '+l; else out.push(l); return out; }, [])
      .join('\n');
    text = text.slice(0, sp.index);
  }
  text = text.replace(/\s+/g,' ').trim();
  const nm = text.match(/^([^|:]{1,60}?):\s*(?=#E|AL |SZ |MV |AC |HD )/);
  if(nm){ name = nm[1].trim(); text = text.slice(nm[0].length); }
  // Line breaks in the book can swallow the "|" ("MV 30 DX 10"): put it back
  // before every key except the one-letter D.
  text = text.replace(/\s(?=(?:#E|AL|SZ|MV|DX|AC|HD|#A|SV|ML|XP|TC)\s)/g, ' | ')
    .replace(/\s(?=D\s+[\d(])/g, ' | ');   // D only before dice or "(per weapon …)" 
  const keyRe = new RegExp(`^(${SB_KEYS.map(k=>k.replace('#','\\#')).join('|')})\\s+(.+)$`);
  const stats = [];
  text.split('|').map(p=>p.trim()).filter(Boolean).forEach(p=>{
    const m = p.match(keyRe);
    if(m) stats.push({k:m[1], v:m[2].trim()});
    else if(stats.length) stats[stats.length-1].v += ' ' + p;   // stray piece of the previous value
  });
  return {name, stats, specials};
}
function sbStat(sb, k){ const s = sb.stats.find(x=>x.k===k); return s ? s.v : ''; }
// HD "4+4" → 4d8+4, "½" / "1/2" → 1d4, at least 1 hp.
function rollEnemyHp(hd){
  const t = String(hd||'').trim();
  if(/^(½|1\/2)/.test(t)) return Math.max(1, rollDie(4));
  const m = t.match(/^(\d+)\s*(?:([+-])\s*(\d+))?/);
  if(!m) return 0;
  let hp = 0;
  for(let i=0;i<parseInt(m[1],10);i++) hp += rollDie(8);
  if(m[2]) hp += (m[2]==='-'?-1:1) * parseInt(m[3],10);
  return Math.max(1, hp);
}
function makeMembers(hd, count){
  return Array.from({length:count}, ()=>{ const hp = rollEnemyHp(hd), n = hdCount(hd); return {id:uid(), hp, max:hp, hd:n, hdMax:n}; });
}
// Enemies are tracked by HP or, per campaign setting, by hit dice.
function enemyHdMode(){ return getActive().enemyTrack==='hd'; }
function setEnemyTrack(mode){ updateActive(camp=>({...camp, enemyTrack:mode})); saveState(); render(); }
function mCur(m){ return enemyHdMode() ? m.hd : m.hp; }
function mMax(m){ return enemyHdMode() ? m.hdMax : m.max; }

// ---- Enemies ----
function toggleBattlePaste(){ ui.battlePasteOpen = !ui.battlePasteOpen; render(); }
function onBattlePasteText(el){ ui.battlePasteText = el.value; }
function onBattlePasteCount(el){ ui.battlePasteCount = el.value; }
function addEnemyFromPaste(){
  const p = parseEnemyStatblock(ui.battlePasteText);
  if(!p.name && !p.stats.length){ alert('Kein Statblock erkannt — erwartet wird z.B. „Ape-Man: #E 1d6 | AL N | MV 30 | AC 8 | HD 1+2 | …"'); return; }
  // The number appearing is rolled by the player (#E stays visible on the block).
  const count = parseInt(ui.battlePasteCount,10) > 0 ? parseInt(ui.battlePasteCount,10) : 1;
  const sb = {id:uid(), kind:'enemy', charId:null, name:p.name||'Gegner', notes:'', stats:p.stats, specials:p.specials, members:makeMembers(sbStatOf(p.stats,'HD'), count), statuses:[]};
  updateActive(camp=>({...camp, statblocks:[...camp.statblocks, sb]}));
  pushLog(enemyHdMode() ? `${sb.name}: ${count}×, HD ${sbStatOf(p.stats,'HD')||'?'}` : `${sb.name}: ${count}×, HP ${sb.members.map(m=>m.max).join(', ')}`, 'battle');
  ui.battlePasteOpen = false; ui.battlePasteText = ''; ui.battlePasteCount = '';
  saveState(); render();
}
function sbStatOf(stats, k){ const s = stats.find(x=>x.k===k); return s ? s.v : ''; }
function addStatblock(){
  const id = uid();
  updateActive(camp=>({...camp, statblocks:[...camp.statblocks, {id, kind:'enemy', charId:null, name:'Gegner', notes:'', stats:[{k:'AC',v:''},{k:'HD',v:'1'},{k:'ML',v:''}], specials:'', members:[{id:uid(), hp:4, max:4, hd:1, hdMax:1}], statuses:[]}]}));
  ui.battleEditId = id;
  saveState(); render();
}
function toggleBattleEdit(id){ ui.battleEditId = ui.battleEditId===id ? null : id; render(); }
function onStatblockName(id, el){ updateStatblock(id, sb=>({...sb, name:el.value})); saveState(); }
function onStatblockNotes(id, el){ updateStatblock(id, sb=>({...sb, notes:el.value})); saveState(); }
function onStatblockSpecials(id, el){ updateStatblock(id, sb=>({...sb, specials:el.value})); saveState(); }
function onStatblockStatline(id, el){
  const p = parseEnemyStatblock(el.value);
  updateStatblock(id, sb=>({...sb, stats:p.stats}));
  saveState();
}
function selectBattleTarget(sbId, memberId){ ui.battleTarget[sbId] = memberId; render(); }
function battleTargetOf(sb){
  const sel = sb.members.find(m=>m.id===ui.battleTarget[sb.id]);
  return sel || sb.members.find(m=>mCur(m)>0) || sb.members[0];
}
// sign -1: damage, +1: healing (not above max).
function applyBattleHp(sbId, sign){
  const sb = getActive().statblocks.find(x=>x.id===sbId);
  const input = document.getElementById('dmg-'+sbId);
  const amount = parseInt(input && input.value, 10);
  if(!sb || !amount) return;
  const target = battleTargetOf(sb);
  if(!target) return;
  const [cur, max] = enemyHdMode() ? ['hd','hdMax'] : ['hp','max'];
  updateStatblock(sbId, x=>({...x, members: x.members.map(m=>m.id!==target.id ? m : {...m, [cur]: sign<0 ? Math.max(0, m[cur]-amount) : Math.min(m[max]||m[cur]+amount, m[cur]+amount)})}));
  ui.battleTarget[sbId] = target.id;
  saveState(); render();
}
function onMemberHp(sbId, memberId, field, el){
  const v = Math.max(0, parseInt(el.value,10)||0);
  updateStatblock(sbId, sb=>({...sb, members: sb.members.map(m=>m.id===memberId ? {...m, [field]:v} : m)}));
  saveState();
}
function addEnemyMember(sbId){
  updateStatblock(sbId, sb=>({...sb, members:[...sb.members, ...makeMembers(sbStat(sb,'HD')||'1', 1)]}));
  saveState(); render();
}
function removeEnemyMember(sbId, memberId){
  updateStatblock(sbId, sb=>({...sb, members: sb.members.filter(m=>m.id!==memberId)}));
  saveState(); render();
}
function rollMorale(sbId){
  const sb = getActive().statblocks.find(x=>x.id===sbId);
  const ml = parseInt(sbStat(sb,'ML'),10);
  const r = rollDie(6)+rollDie(6);
  pushLog(`Moral ${sb.name}: 2d6→${r}${ml ? ` gegen ML ${ml} — ${r<=ml ? 'hält stand' : 'Moral bricht (Flucht/Aufgabe)'}` : ' (kein ML angegeben)'}`, 'battle');
  render();
}
function duplicateStatblock(id){
  updateActive(camp=>{
    const idx = camp.statblocks.findIndex(sb=>sb.id===id);
    if(idx===-1) return camp;
    const src = camp.statblocks[idx];
    const copy = {...src, id:uid(), members: makeMembers(sbStatOf(src.stats,'HD')||'1', Math.max(1, src.members.length)), statuses:[]};
    const statblocks = [...camp.statblocks];
    statblocks.splice(idx+1,0,copy);
    return {...camp, statblocks};
  });
  saveState(); render();
}
function deleteStatblock(id){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.filter(sb=>sb.id!==id)}));
  if(ui.battleEditId===id) ui.battleEditId = null;
  saveState(); render();
}
function clearDefeatedEnemies(){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.filter(sb=>sb.kind==='pc' || sb.members.some(m=>mCur(m)>0))}));
  saveState(); render();
}

// ---- Statuses (kept from the old statblocks) ----
function addStatblockStatus(sbId){
  updateStatblock(sbId, sb=>({...sb, statuses:[...(sb.statuses||[]), {id:uid(), name:'Status', value:[false,false,false,false,false,false]}]}));
  saveState(); render();
}
function onStatblockStatusName(sbId, statusId, el){
  updateStatblock(sbId, sb=>({...sb, statuses: sb.statuses.map(st=>st.id===statusId?{...st,name:el.value}:st)}));
  saveState();
}
function deleteStatblockStatus(sbId, statusId){
  updateStatblock(sbId, sb=>({...sb, statuses: sb.statuses.filter(st=>st.id!==statusId)}));
  saveState(); render();
}
function toggleStatblockStatusBox(sbId, statusId, boxIdx){
  updateStatblock(sbId, sb=>({...sb, statuses: sb.statuses.map(st=>{
    if(st.id!==statusId) return st;
    const boxes = [...st.value];
    boxes[boxIdx] = !boxes[boxIdx];
    return {...st, value:boxes};
  })}));
  saveState(); render();
}
function reduceStatblockStatusTier(sbId, statusId, amount){
  amount = parseInt(amount,10);
  if(!amount || amount<1) return;
  updateStatblock(sbId, sb=>({...sb, statuses: sb.statuses.map(st=>{
    if(st.id!==statusId) return st;
    const boxes = [false,false,false,false,false,false];
    st.value.forEach((marked,idx)=>{ if(!marked) return; const n=idx-amount; if(n>=0) boxes[n]=true; });
    return {...st, value:boxes};
  })}));
  saveState(); render();
}
function clearStatblockStatus(sbId, statusId){
  updateStatblock(sbId, sb=>({...sb, statuses: sb.statuses.map(st=>st.id===statusId?{...st,value:[false,false,false,false,false,false]}:st)}));
  saveState(); render();
}

// ---- Rendering ----
const SB_SHOW_ORDER = ['#E','AC','HD','MV','DX','#A','D','SV','ML','AL','SZ','XP','TC'];
function renderSpecials(text){
  // "Climb: 11-in-12 … Shamanism: …" → ability names in bold.
  return escapeHtml(text).replace(/(^|[.)]\s+|•\s*)([A-Z][A-Za-z'’ -]{1,30}?):/gm, '$1<b>$2:</b>');
}
function renderEnemyBlock(sb){
  const editing = ui.battleEditId===sb.id;
  const alive = sb.members.filter(m=>mCur(m)>0).length;
  const hdMode = enemyHdMode(), [curKey, maxKey] = hdMode ? ['hd','hdMax'] : ['hp','max'];
  const target = battleTargetOf(sb);
  const xpEach = parseInt(String(sbStat(sb,'XP')).replace(/[^\d]/g,''),10) || 0;
  const defeated = sb.members.length - alive;
  const stats = [...sb.stats].sort((a,b)=>{
    const ia = SB_SHOW_ORDER.indexOf(a.k), ib = SB_SHOW_ORDER.indexOf(b.k);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  const statLine = stats.filter(s=>s.v).map(s=>`<span class="sb-item${s.v.length>14?' sb-wrap':''}"><span class="sb-lbl">${escapeHtml(s.k)}</span> ${escapeHtml(s.v)}</span>`).join('<span class="sb-sep"> · </span>');
  const chips = sb.members.map((m,i)=>{
    const cur = mCur(m), max = mMax(m);
    const dead = cur<=0, low = !dead && max && cur<=max/3, sel = target && m.id===target.id;
    return `<button class="hp-chip${dead?' dead':''}${low?' low':''}${sel?' sel':''}" onclick="selectBattleTarget('${sb.id}','${m.id}')">${i+1} · ${hdMode?'HD ':''}<b>${cur}</b>/${max}</button>`;
  }).join('');
  return `<div class="panel battle-enemy">
    <div class="row" style="gap:8px;align-items:baseline;">
      ${editing ? `<input type="text" value="${escapeHtml(sb.name)}" placeholder="Name" oninput="onStatblockName('${sb.id}',this)" style="flex:1;font-weight:600;">`
        : `<span class="sb-name" style="font-size:17px;">${escapeHtml(sb.name||'Gegner')}</span><span class="small-muted">${sb.members.length>1 ? `${alive}/${sb.members.length}` : (alive ? '' : 'besiegt')}</span><span style="flex:1;"></span>`}
      <button class="btn btn-raised" style="padding:3px 8px;font-size:12px;" onclick="rollMorale('${sb.id}')">Moral 2d6</button>
      <button class="icon-btn" onclick="toggleBattleEdit('${sb.id}')" title="Bearbeiten">${editing?'✓':'⋯'}</button>
    </div>
    ${editing
      ? `<span class="small-muted">Statzeile (wie im Buch, mit | getrennt):</span>
         <textarea rows="2" oninput="onStatblockStatline('${sb.id}',this)">${escapeHtml(sb.stats.map(s=>`${s.k} ${s.v}`).join(' | '))}</textarea>
         <span class="small-muted">Specials:</span>
         <textarea rows="3" oninput="onStatblockSpecials('${sb.id}',this)">${escapeHtml(sb.specials)}</textarea>`
      : (statLine ? `<div class="sb-line battle-stats" style="border-top:none;">${statLine}</div>` : '')}
    <div class="row wrap" style="gap:6px;">
      ${editing
        ? sb.members.map((m,i)=>`<span class="hp-chip" style="display:inline-flex;gap:4px;align-items:center;">${i+1}
${hdMode?' HD':''}
            <input type="number" value="${m[curKey]}" onchange="onMemberHp('${sb.id}','${m.id}','${curKey}',this)" style="width:52px;padding:2px 4px;">/
            <input type="number" value="${m[maxKey]}" onchange="onMemberHp('${sb.id}','${m.id}','${maxKey}',this)" style="width:52px;padding:2px 4px;">
            <button class="x-btn" onclick="removeEnemyMember('${sb.id}','${m.id}')">✕</button></span>`).join('')
          + `<button class="btn btn-raised" style="padding:3px 8px;font-size:12px;" onclick="addEnemyMember('${sb.id}')">+ 1 (HD würfeln)</button>`
        : chips + (sb.members.length ? `<span class="row" style="gap:4px;margin-left:auto;">
            <input type="number" min="1" id="dmg-${sb.id}" placeholder="${target?`#${sb.members.indexOf(target)+1}`:''}" style="width:58px;padding:4px 6px;" onkeydown="if(event.key==='Enter'){applyBattleHp('${sb.id}',-1);}">
            <button class="btn btn-outline-wax" style="padding:3px 8px;font-size:12px;" onclick="applyBattleHp('${sb.id}',-1)">Schaden</button>
            <button class="btn btn-raised" style="padding:3px 8px;font-size:12px;" onclick="applyBattleHp('${sb.id}',1)">Heilen</button>
          </span>` : '')}
    </div>
    ${!editing && sb.specials ? `<div class="small-muted battle-specials">${renderSpecials(sb.specials)}</div>` : ''}
    ${!editing && sb.desc ? `<details><summary class="small-muted" style="cursor:pointer;">Beschreibung</summary><div class="battle-desc">${escapeHtml(sb.desc)}</div></details>` : ''}
    ${!editing && xpEach && defeated ? `<span class="small-muted">XP: ${defeated} × ${xpEach} = ${defeated*xpEach}</span>` : ''}
    ${editing || sb.notes ? `<textarea rows="2" placeholder="Notizen" oninput="onStatblockNotes('${sb.id}',this)" ${editing?'':'readonly'}>${escapeHtml(sb.notes)}</textarea>` : ''}
    ${(sb.statuses||[]).length || editing ? `<div style="display:flex;flex-direction:column;gap:8px;">
      ${(sb.statuses||[]).map(st=>{
        const inputId = `sbstatusreduce-${st.id}`;
        return `<div style="display:flex;flex-direction:column;gap:6px;background:var(--panel-raised);border-radius:10px;padding:8px;">
          <div class="row">
            <input type="text" value="${escapeHtml(st.name)}" placeholder="Statusname" oninput="onStatblockStatusName('${sb.id}','${st.id}', this)" style="flex:1;">
            <button class="icon-btn raised" style="color:var(--wax);" onclick="deleteStatblockStatus('${sb.id}','${st.id}')" title="Status löschen">🗑</button>
          </div>
          ${renderStatusControl(st.value,
            idx=>`toggleStatblockStatusBox('${sb.id}','${st.id}',${idx})`,
            iid=>`reduceStatblockStatusTier('${sb.id}','${st.id}', document.getElementById('${iid}').value)`,
            ()=>`clearStatblockStatus('${sb.id}','${st.id}')`, inputId)}
        </div>`;
      }).join('')}
      ${editing ? `<div class="row wrap" style="gap:6px;">
        <button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="addStatblockStatus('${sb.id}')">+ Status</button>
        <button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="duplicateStatblock('${sb.id}')">⧉ Neue Gruppe davon</button>
        <button class="btn btn-outline-wax" style="padding:4px 8px;font-size:12px;margin-left:auto;" onclick="deleteStatblock('${sb.id}')">🗑 Entfernen</button>
      </div>` : ''}
    </div>` : ''}
  </div>`;
}

function renderBattleTab(){
  const active = getActive();
  const party = active.statblocks.filter(sb=>sb.kind==='pc');
  const enemies = active.statblocks.filter(sb=>sb.kind!=='pc');
  const inBattle = new Set(party.map(sb=>sb.charId));
  let html = `<div class="grid-cards">`;
  html += renderResultsPanel('span-all', 'battle');
  html += renderDiceRollerPanel('battle');
  html += `</div>`;

  html += `<div class="row wrap" style="gap:8px;align-items:center;">
    <span class="sb-name" style="font-size:17px;">Runde ${active.battleRound||1}</span>
    <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="nextBattleRound()">Nächste Runde</button>
    <button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="rollSideInitiative()">Initiative d6</button>
    ${(active.battleRound||1)>1 ? `<button class="icon-btn" onclick="resetBattleRound()" title="Runde zurücksetzen">↺</button>` : ''}
  </div>`;

  html += `<div class="row between"><span class="label">Party</span>
    <button class="btn ${ui.showStatblockCharPicker?'btn-gold':'btn-raised'}" style="padding:4px 8px;font-size:12px;" onclick="toggleStatblockCharPicker()">+ Charakter</button></div>`;
  if(ui.showStatblockCharPicker){
    const avail = active.characters.filter(c=>!inBattle.has(c.id));
    html += `<div class="panel" style="gap:6px;">${avail.length
      ? `<div class="row wrap" style="gap:6px;">${avail.map(c=>`<button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="addStatblockFromCharacter('${c.id}')">${escapeHtml(c.name)}</button>`).join('')}</div>`
      : `<span class="small-muted">${active.characters.length ? 'Alle Charaktere sind schon im Kampf.' : 'Noch keine Charaktere angelegt.'}</span>`}</div>`;
  }
  html += party.length ? party.map(renderPartyRow).join('') : `<p class="small-muted" style="margin:0;">Füge deine Charaktere hinzu — HP und Munition sind direkt mit dem Charakterbogen verbunden.</p>`;

  const anyDefeated = enemies.some(sb=>sb.members.length && sb.members.every(m=>mCur(m)<=0));
  const hdMode = active.enemyTrack==='hd';
  html += `<div class="row between wrap" style="margin-top:6px;gap:6px;"><span class="label">Gegner</span>
    <div class="row wrap" style="gap:6px;justify-content:flex-end;">
      <div class="mode-toggle" title="Gegner nach Trefferpunkten oder Trefferwürfeln führen">
        <button style="padding:4px 8px;${!hdMode?'background:var(--gold);color:var(--bg);':''}" onclick="setEnemyTrack('hp')">HP</button>
        <button style="padding:4px 8px;${hdMode?'background:var(--gold);color:var(--bg);':''}" onclick="setEnemyTrack('hd')">HD</button>
      </div>
      ${anyDefeated ? `<button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="clearDefeatedEnemies()">Besiegte entfernen</button>` : ''}
      <button class="btn ${ui.bestiaryOpen?'btn-gold':'btn-raised'}" style="padding:4px 8px;font-size:12px;" onclick="toggleBestiaryPanel()">Bestiarium</button>
      <button class="btn ${ui.battlePasteOpen?'btn-gold':'btn-raised'}" style="padding:4px 8px;font-size:12px;" onclick="toggleBattlePaste()">Einfügen</button>
      <button class="btn btn-raised" style="padding:4px 8px;font-size:12px;" onclick="addStatblock()">+ Leer</button>
    </div></div>`;
  if(ui.bestiaryOpen) html += renderBestiaryPanel();
  if(ui.battlePasteOpen){
    html += `<div class="panel" style="gap:8px;">
      <span class="small-muted">Statblock aus dem Buch hineinkopieren, z.B. „Ape-Man: #E 1d6 (6d6) | AL N | SZ M | MV 30 | DX 10 | AC 8 | HD 1+2 | #A 1/1 (weapon) | D (per weapon +1) | SV 16 | ML 9 | XP 24 | Special: Climb: …"</span>
      <textarea rows="5" oninput="onBattlePasteText(this)" placeholder="Statblock einfügen…">${escapeHtml(ui.battlePasteText)}</textarea>
      <div class="row" style="gap:8px;">
        <input type="number" min="1" value="${escapeHtml(ui.battlePasteCount)}" oninput="onBattlePasteCount(this)" placeholder="Anzahl (selbst nach #E würfeln)" style="flex:1;">
        <button class="btn btn-gold" onclick="addEnemyFromPaste()">Hinzufügen</button>
      </div>
    </div>`;
  }
  html += enemies.length ? `<div class="masonry-cards">${enemies.map(renderEnemyBlock).join('')}</div>`
    : `<p class="small-muted" style="margin:0;">Noch keine Gegner. „Statblock einfügen" liest Statblocks im Hyperborea-Format; die HP werden nach HD ausgewürfelt.</p>`;
  return html;
}
