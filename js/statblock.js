// Charakter tab, statblock view: the sheet condensed to a few OSR-style lines.
// Every field/section can be placed via sb ('title' | 'head' | 'line'), with
// a short label (sbAbbr) and, for tables, the columns to show (sbCols).
// Title: values next to the name (class, level). Head: one row of short
// stats (HP, AC, MV…); fields sharing a label merge into "9/11". Lines: one
// labelled line per field or whole section ("Saves Death 16 · Trans 15").

// "Armour Class (AC)" → "AC"; names without an uppercase short form stay.
function sbDefaultAbbr(name){
  const m = String(name||'').match(/\(([A-Z#][A-Za-z#]{0,4})\)/);
  return m ? m[1] : String(name||'');
}
function sbLabel(x){ return (x.sbAbbr||'').trim() || sbDefaultAbbr(x.name); }
function sbIsEmpty(v){ return v==null || /^[\s—–-]*$/.test(String(v)); }

function sbCounterButtons(section, f){
  return `<button class="sb-step" onclick="incrementFieldCounter('${section.id}','${f.id}',-1)" aria-label="${escapeHtml(f.name)} −1">−</button>`;
}
function sbCounterPlus(section, f){
  return `<button class="sb-step" onclick="incrementFieldCounter('${section.id}','${f.id}',1)" aria-label="${escapeHtml(f.name)} +1">+</button>`;
}
// A single short value, counters with −/+ around it.
function sbValue(section, f){
  if(f.type==='counter') return `<span class="sb-counter">${sbCounterButtons(section,f)}<b>${escapeHtml(f.value)}</b>${sbCounterPlus(section,f)}</span>`;
  return `<b>${escapeHtml(String(f.value).replace(/\n+/g,' · '))}</b>`;
}

// Table → either a compact grid (ST 17 | DX 15 …) or inline rows.
function sbTable(f){
  const tv = f.value || {columns:[], rows:[]};
  const cols = (f.sbCols && f.sbCols.length ? f.sbCols : tv.columns.map((_,i)=>i)).filter(i=>i<tv.columns.length);
  const rows = tv.rows.map(r=>cols.map(i=>sbIsEmpty(r[i]) ? '' : String(r[i]).trim())).filter(cells=>cells.some(c=>c!==''));
  if(!rows.length) return '';
  const short = rows.every(r=>r.length===2 && sbDefaultAbbr(r[0]).length<=4 && r[1].length<=5);
  if(cols.length===2 && short && rows.length>=2 && rows.length<=8){
    return `<div class="sb-grid" style="grid-template-columns:repeat(${rows.length},1fr);">${rows.map(r=>`<div><div class="sb-lbl">${escapeHtml(sbDefaultAbbr(r[0]))}</div><b>${escapeHtml(r[1]||'–')}</b></div>`).join('')}</div>`;
  }
  return rows.map(r=>{
    const [first, ...rest] = r;
    return `<span class="sb-item${rest.length>1?' sb-wrap':''}">${first?`<b>${escapeHtml(first)}</b>`:''}${rest.filter(Boolean).map(c=>' '+escapeHtml(c)).join('')}</span>`;
  }).join('<span class="sb-sep"> · </span>');
}
function sbList(f){
  const items = (Array.isArray(f.value)?f.value:[]).filter(x=>String(x).trim());
  return items.map(x=>`<span class="sb-item">${escapeHtml(x)}</span>`).join('<span class="sb-sep"> · </span>');
}
// Spell slots: one line per spell level with the prepared spells as chips.
function sbSpellLines(section, f, label){
  const v = normSpellValue(f.value);
  const suggestions = [...new Set(section.fields.filter(x=>x.type==='list' && Array.isArray(x.value)).flatMap(x=>x.value))];
  const dlId = `sbspellsugg-${f.id}`;
  const lines = v.levels.map((l,li)=>{
    if(l.slots===0 && !l.prepared.length) return '';
    const free = l.slots - l.prepared.length;
    const inputId = `sbspell-${f.id}-${li}`;
    return `<div class="sb-line"><span class="sb-lbl">${escapeHtml(label)} ${li+1}</span>
      ${l.prepared.map((p,pi)=>`<button class="sb-chip ${p.cast?'cast':''}" title="${p.cast?'Mark as available':'Mark as cast'}" onclick="toggleSpellCast('${section.id}','${f.id}',${li},${pi})">${escapeHtml(p.name)}</button>`).join('')}
      ${free>0 ? `<input id="${inputId}" class="sb-prep" list="${dlId}" placeholder="+ prepare (${free})" onkeydown="if(event.key==='Enter'){prepareSpell('${section.id}','${f.id}',${li},this);}" onchange="prepareSpell('${section.id}','${f.id}',${li},this)">` : ''}
    </div>`;
  }).join('');
  if(!lines) return '';
  return lines + `<div class="sb-line" style="justify-content:flex-end;margin-top:-2px;"><button class="sb-chip" onclick="restSpells('${section.id}','${f.id}')" title="All prepared spells available again">↺ New day</button></div>`
    + (suggestions.length ? `<datalist id="${dlId}">${suggestions.map(x=>`<option value="${escapeHtml(x)}">`).join('')}</datalist>` : '');
}
function sbEditBtn(onclick){ return ui.managing ? `<button class="x-btn sb-edit" onclick="${onclick}">✎</button>` : ''; }

// One field as its own labelled line ('' when there is nothing to show).
function sbFieldLine(section, f, label){
  const edit = sbEditBtn(`startEditField('${section.id}','${f.id}')`);
  if(f.type==='spells') return sbSpellLines(section, f, label);
  let content = '';
  if(f.type==='table') content = sbTable(f);
  else if(f.type==='list') content = sbList(f);
  else if(f.type==='status') content = renderFieldControl(section.id, f);
  else if(f.type==='counter' || !sbIsEmpty(f.value)) content = sbValue(section, f);
  if(!content) return ui.managing ? `<div class="sb-line"><span class="sb-lbl">${escapeHtml(label)}</span><span class="small-muted">—</span>${edit}</div>` : '';
  if(content.startsWith('<div class="sb-grid"')) return `<div class="sb-block">${content}${edit}</div>`;
  return `<div class="sb-line"><span class="sb-lbl">${escapeHtml(label)}</span>${content}${edit}</div>`;
}
// A whole section as one line: short fields inline, tables/lists/spells below.
function sbSectionLines(section){
  const edit = sbEditBtn(`startEditSectionName('${section.id}')`);
  const simple = section.fields.filter(f=>['number','counter','text'].includes(f.type));
  const complex = section.fields.filter(f=>!['number','counter','text'].includes(f.type));
  const items = simple.filter(f=>f.type==='counter' || !sbIsEmpty(f.value))
    .map(f=>`<span class="sb-item"><span class="sb-lbl">${escapeHtml(sbLabel(f))}</span> ${sbValue(section,f)}</span>`);
  let html = '';
  if(items.length || ui.managing) html += `<div class="sb-line"><span class="sb-lbl sb-lbl-main">${escapeHtml(sbLabel(section))}</span>${items.join('<span class="sb-sep"> · </span>') || '<span class="small-muted">—</span>'}${edit}</div>`;
  complex.forEach(f=>{ html += sbFieldLine(section, f, sbLabel(f)); });
  return html;
}

function renderCharacterStatblock(c){
  const title = [], head = new Map(), lines = [];
  c.sections.forEach(section=>{
    if(section.sb==='line'){ lines.push(sbSectionLines(section)); return; }
    section.fields.forEach(f=>{
      if(f.sb==='title'){
        if(sbIsEmpty(f.value)) return;
        title.push(f.type==='text' ? escapeHtml(f.value) : `${escapeHtml(sbLabel(f))} ${escapeHtml(f.value)}`);
      } else if(f.sb==='head'){
        const k = sbLabel(f);
        if(!head.has(k)) head.set(k, []);
        head.get(k).push({section, f});
      } else if(f.sb==='line'){
        lines.push(sbFieldLine(section, f, sbLabel(f)));
      }
    });
  });
  const configured = title.length || head.size || lines.some(Boolean)
    || c.sections.some(s=>s.sb || s.fields.some(f=>f.sb));
  if(!configured){
    return `<div class="panel empty"><span class="small-muted">Noch nichts für den Statblock eingestellt. Lege fest, was wohin kommt (✎ am Feld oder Bereich → „Im Statblock"), oder lass es anhand der Feldnamen vorschlagen.</span>
      <button class="btn btn-gold" onclick="applyStatblockSuggestions()">Statblock automatisch einrichten</button></div>`;
  }
  const headHtml = [...head.entries()].map(([k, parts])=>{
    const counter = parts.find(p=>p.f.type==='counter');
    const vals = parts.map(p=>p.f===(counter&&counter.f) ? `<b>${escapeHtml(p.f.value)}</b>` : `<span class="${p===parts[0]?'':'sb-lbl'}">${escapeHtml(sbIsEmpty(p.f.value)?'–':p.f.value)}</span>`).join('<span class="sb-lbl">/</span>');
    const edit = sbEditBtn(`startEditField('${parts[0].section.id}','${parts[0].f.id}')`);
    if(counter) return `<span class="sb-head-item sb-boxed">${sbCounterButtons(counter.section,counter.f)}<span><span class="sb-lbl">${escapeHtml(k)}</span> ${vals}</span>${sbCounterPlus(counter.section,counter.f)}${edit}</span>`;
    return `<span class="sb-head-item"><span class="sb-lbl">${escapeHtml(k)}</span> <b>${vals}</b>${edit}</span>`;
  }).join('');
  return `<div class="panel sb-card">
    <div class="sb-title"><span class="sb-name">${escapeHtml(c.name)}</span>${title.length?`<span class="small-muted">${title.join(' · ')}</span>`:''}</div>
    ${headHtml ? `<div class="sb-head">${headHtml}</div>` : ''}
    ${lines.join('')}
    ${ui.managing ? `<div class="row" style="justify-content:flex-end;"><button class="btn btn-raised" style="padding:4px 10px;font-size:12px;" onclick="applyStatblockSuggestions()">Fehlendes automatisch ergänzen</button></div>` : ''}
  </div>`;
}

// Fill in statblock placements from field names (OSR/Hyperborea sheets).
// Only touches fields and sections that have no placement yet.
function suggestSbFor(section, f){
  const n = f.name.toLowerCase(), sn = section.name.toLowerCase();
  const up = (f.name.match(/\(([A-Z]{2,3})\)/)||[])[1];
  if(f.type==='spells') return {sb:'line', sbAbbr:'Spells'};
  if(/hit points|^hp\b/.test(n)) return (f.type==='counter' || f.type==='number') ? {sb:'head', sbAbbr:'HP'} : null;
  if(up && ['AC','MV','FA','DR','CA','TA'].includes(up) && (f.type==='number' || f.type==='counter')) return {sb:'head', sbAbbr:up};
  if(f.type==='text' && /^(class|race|alignment)$/.test(n)) return {sb:'title'};
  if(f.type==='number' && /^level$/.test(n)) return {sb:'title', sbAbbr:'Lvl'};
  if(f.type==='table' && /attribute/.test(n+' '+sn)) return {sb:'line', sbAbbr:'Attributes', sbCols:[0,1]};
  if(f.type==='table' && /saving throw/.test(n+' '+sn)) return {sb:'line', sbAbbr:'Saves', sbCols:[0,1]};
  if(f.type==='table' && /weapon|melee|missile/.test(n+' '+sn)){
    // Name, attack rate, attack modifier, damage — the rest stays on the sheet.
    const cols = ((f.value && f.value.columns) || []).map((c,i)=>[String(c).toLowerCase(), i])
      .filter(([c,i])=>i===0 || /rate|mod|dam|range/.test(c)).map(([,i])=>i);
    return {sb:'line', sbAbbr: /melee/.test(n+' '+sn) ? 'Melee' : /missile/.test(n+' '+sn) ? 'Missile' : 'Weapons', sbCols: cols.length>1 ? cols : null};
  }
  if(f.type==='counter' && /ammunition|arrows|bolts/.test(n+' '+sn)) return {sb:'line', sbAbbr:'Ammo'};
  return null;
}
function applyStatblockSuggestions(){
  updateCurrentCharacter(c=>({...c, sections: c.sections.map(s=>{
    if(s.sb) return s;
    const sn = s.name.toLowerCase();
    const simple = s.fields.length && s.fields.every(f=>['number','counter','text'].includes(f.type));
    if(/saving throws?/.test(sn) && simple) return {...s, sb:'line', sbAbbr: s.sbAbbr || 'Saves'};
    return {...s, fields: s.fields.map(f=>{
      if(f.sb) return f;
      const sug = suggestSbFor(s, f);
      return sug ? {...f, sbAbbr:'', sbCols:null, ...sug} : f;
    })};
  })}));
  saveState(); render();
}
