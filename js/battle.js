// Kampf tab: statblocks.
// ---- Statblocks ----
function addStatblock(){
  updateActive(camp=>({...camp, statblocks:[...camp.statblocks, {id:uid(), name:'', hp:'10', notes:'', statuses:[]}]}));
  saveState(); render();
}
function toggleStatblockCharPicker(){ ui.showStatblockCharPicker = !ui.showStatblockCharPicker; render(); }
function addStatblockFromCharacter(charId){
  const active = getActive();
  const c = active.characters.find(x=>x.id===charId);
  if(!c) return;
  let hp = '10';
  outer: for(const s of c.sections){
    for(const f of s.fields){
      if(f.type==='counter' && /hp|leben|trefferpunkte|health/i.test(f.name)){ hp = f.value; break outer; }
    }
  }
  updateActive(camp=>({...camp, statblocks:[...camp.statblocks, {id:uid(), name:c.name, hp, notes:'', statuses:[]}]}));
  ui.showStatblockCharPicker = false;
  saveState(); render();
}
function onStatblockName(id, el){ updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id===id?{...sb,name:el.value}:sb)})); saveState(); }
function onStatblockHp(id, el){ updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id===id?{...sb,hp:el.value}:sb)})); saveState(); }
function onStatblockNotes(id, el){ updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id===id?{...sb,notes:el.value}:sb)})); saveState(); }
function incrementStatblockHp(id, delta){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>{
    if(sb.id!==id) return sb;
    const num = parseFloat(sb.hp);
    return {...sb, hp:String((isNaN(num)?0:num)+delta)};
  })}));
  saveState(); render();
}
function addStatblockStatus(sbId){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id===sbId?{...sb, statuses:[...(sb.statuses||[]), {id:uid(), name:'Status', value:[false,false,false,false,false,false]}]}:sb)}));
  saveState(); render();
}
function onStatblockStatusName(sbId, statusId, el){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id!==sbId?sb:{...sb, statuses: sb.statuses.map(st=>st.id===statusId?{...st,name:el.value}:st)})}));
  saveState();
}
function deleteStatblockStatus(sbId, statusId){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id!==sbId?sb:{...sb, statuses: sb.statuses.filter(st=>st.id!==statusId)})}));
  saveState(); render();
}
function toggleStatblockStatusBox(sbId, statusId, boxIdx){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id!==sbId?sb:{...sb, statuses: sb.statuses.map(st=>{
    if(st.id!==statusId) return st;
    const boxes = [...st.value];
    boxes[boxIdx] = !boxes[boxIdx];
    return {...st, value:boxes};
  })})}));
  saveState(); render();
}
function reduceStatblockStatusTier(sbId, statusId, amount){
  amount = parseInt(amount,10);
  if(!amount || amount<1) return;
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id!==sbId?sb:{...sb, statuses: sb.statuses.map(st=>{
    if(st.id!==statusId) return st;
    const boxes = [false,false,false,false,false,false];
    st.value.forEach((marked,idx)=>{ if(!marked) return; const n=idx-amount; if(n>=0) boxes[n]=true; });
    return {...st, value:boxes};
  })})}));
  saveState(); render();
}
function clearStatblockStatus(sbId, statusId){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.map(sb=>sb.id!==sbId?sb:{...sb, statuses: sb.statuses.map(st=>st.id===statusId?{...st,value:[false,false,false,false,false,false]}:st)})}));
  saveState(); render();
}
function duplicateStatblock(id){
  updateActive(camp=>{
    const idx = camp.statblocks.findIndex(sb=>sb.id===id);
    if(idx===-1) return camp;
    const copy = {...camp.statblocks[idx], id:uid(), name:camp.statblocks[idx].name+' (Kopie)'};
    const statblocks = [...camp.statblocks];
    statblocks.splice(idx+1,0,copy);
    return {...camp, statblocks};
  });
  saveState(); render();
}
function deleteStatblock(id){
  updateActive(camp=>({...camp, statblocks: camp.statblocks.filter(sb=>sb.id!==id)}));
  saveState(); render();
}

function renderBattleTab(){
  const active = getActive();
  let html = `<div class="grid-cards">`;
  html += renderResultsPanel('span-all', 'battle');
  html += renderDiceRollerPanel('battle');
  html += `<div class="row between span-all"><span class="label">⚔️ Statblocks</span>
    <div class="row" style="gap:6px;">
      <button class="btn ${ui.showStatblockCharPicker?'btn-gold':'btn-raised'}" style="padding:4px 8px;font-size:12px;" onclick="toggleStatblockCharPicker()">Aus Charakter</button>
      <button class="btn btn-gold" style="padding:4px 8px;font-size:12px;" onclick="addStatblock()">+ Statblock anlegen</button>
    </div></div>`;
  if(ui.showStatblockCharPicker){
    if(active.characters.length===0){
      html += `<div class="panel span-all"><span class="small-muted">Noch keine Charaktere angelegt.</span></div>`;
    } else {
      html += `<div class="panel span-all" style="gap:6px;">
        <span class="small-muted">Charakter als Statblock übernehmen (Name + HP):</span>
        <div class="row wrap" style="gap:6px;">
          ${active.characters.map(c=>`<button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="addStatblockFromCharacter('${c.id}')">${escapeHtml(c.name)}</button>`).join('')}
        </div>
      </div>`;
    }
  }
  if(active.statblocks.length===0){
    html += `<div class="panel empty span-all"><span>Noch keine Statblocks angelegt.</span>
      <button class="btn btn-raised" onclick="addStatblock()">+ Statblock anlegen</button></div>`;
  } else {
    html += active.statblocks.map(sb=>`
      <div class="panel">
        <div class="row">
          <input type="text" value="${escapeHtml(sb.name)}" placeholder="Name" oninput="onStatblockName('${sb.id}', this)" style="flex:1;font-weight:600;">
          <button class="icon-btn raised" onclick="duplicateStatblock('${sb.id}')" title="Duplizieren">⧉</button>
          <button class="icon-btn raised" style="color:var(--wax);" onclick="deleteStatblock('${sb.id}')" title="Löschen">🗑</button>
        </div>
        <div class="row" style="gap:12px;">
          <span class="small-muted" style="width:28px;">HP</span>
          <button class="counter-btn" onclick="incrementStatblockHp('${sb.id}',-1)">−</button>
          <input type="number" value="${escapeHtml(sb.hp)}" oninput="onStatblockHp('${sb.id}', this)" style="width:64px;text-align:center;font-weight:600;">
          <button class="counter-btn" onclick="incrementStatblockHp('${sb.id}',1)">+</button>
        </div>
        <textarea rows="3" oninput="onStatblockNotes('${sb.id}', this)">${escapeHtml(sb.notes)}</textarea>
        <div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--border);padding-top:10px;">
          <div class="row between">
            <span class="small-muted">Status</span>
            <button class="btn btn-raised" style="padding:4px 8px;font-size:11px;" onclick="addStatblockStatus('${sb.id}')">+ Status</button>
          </div>
          ${(sb.statuses||[]).map(st=>{
            const inputId = `sbstatusreduce-${st.id}`;
            return `<div style="display:flex;flex-direction:column;gap:6px;background:var(--panel-raised);border-radius:10px;padding:8px;">
              <div class="row">
                <input type="text" value="${escapeHtml(st.name)}" placeholder="Statusname (z.B. wounded)" oninput="onStatblockStatusName('${sb.id}','${st.id}', this)" style="flex:1;">
                <button class="icon-btn raised" style="color:var(--wax);" onclick="deleteStatblockStatus('${sb.id}','${st.id}')" title="Status löschen">🗑</button>
              </div>
              ${renderStatusControl(
                st.value,
                idx=>`toggleStatblockStatusBox('${sb.id}','${st.id}',${idx})`,
                iid=>`reduceStatblockStatusTier('${sb.id}','${st.id}', document.getElementById('${iid}').value)`,
                ()=>`clearStatblockStatus('${sb.id}','${st.id}')`,
                inputId
              )}
            </div>`;
          }).join('') || `<p class="small-muted">Noch keine Status.</p>`}
        </div>
      </div>`).join('');
  }
  html += `</div>`;
  return html;
}
