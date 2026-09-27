// Beziehungen tab: relationship web.
// ============================================================
// Beziehungen (directed relationship / faction web)
// ============================================================
// Small deterministic PRNG + string hash, used only to seed a handful of
// different force-layout starting positions below. Deterministic (not
// Math.random()) so the SAME graph always settles on the SAME layout
// between renders instead of jittering every time you tap something.
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return h>>>0; }
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function segmentsIntersect(p1,p2,p3,p4){
  function ccw(a,b,c){ return (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x); }
  const d1=ccw(p3,p4,p1), d2=ccw(p3,p4,p2), d3=ccw(p1,p2,p3), d4=ccw(p1,p2,p4);
  return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0));
}
function countEdgeCrossings(pos, idx, edges){
  let count = 0;
  for(let i=0;i<edges.length;i++){
    const a1=idx[edges[i].from], a2=idx[edges[i].to];
    if(a1==null||a2==null) continue;
    for(let j=i+1;j<edges.length;j++){
      const b1=idx[edges[j].from], b2=idx[edges[j].to];
      if(b1==null||b2==null) continue;
      if(a1===b1||a1===b2||a2===b1||a2===b2) continue; // sharing a node isn't a "crossing"
      if(segmentsIntersect(pos[a1],pos[a2],pos[b1],pos[b2])) count++;
    }
  }
  return count;
}
// Force-directed layout (nodes repel each other, edges pull their two ends
// together like springs). No position is stored — this is recomputed every
// time from the node/edge list. Since a spring simulation can settle into
// different local optima depending on where it starts, this tries a
// handful of deterministic starting layouts and keeps whichever one ends
// up with the fewest edges crossing each other, so the graph reads as
// cleanly as a force layout reasonably can instead of leaving every node on
// a fixed ring regardless of how they relate to each other.
// The layout depends only on node ids and edge endpoints, so it's cached on
// that key — renaming, relabeling or re-rendering skips the simulation.
let relationLayoutCache = {key:null, pos:null};
function getRelationLayout(){
  const active = getActive();
  const list = active.relationNodes;
  const n = list.length;
  if(n===0) return [];
  const idx = {}; list.forEach((node,i)=>idx[node.id]=i);
  const edges = active.relationEdges;
  const layoutKey = list.map(node=>node.id).join(',') + '|' + edges.map(e=>e.from+'>'+e.to).join(',');
  if(relationLayoutCache.key===layoutKey){
    return list.map((node,i)=>({...node, x:relationLayoutCache.pos[i].x, y:relationLayoutCache.pos[i].y}));
  }
  const seedBase = hashStr(layoutKey);
  const cx=200, cy=200;

  function simulate(variant){
    const rnd = mulberry32((seedBase + variant*7919) >>> 0);
    const pos = list.map((node,i)=>{
      const angle = (2*Math.PI*i/n) - Math.PI/2 + (rnd()-0.5)*0.7;
      const rad = n>1 ? 150*(0.8+rnd()*0.4) : 0;
      return {x: cx + (n>1 ? rad*Math.cos(angle) : 0), y: cy + (n>1 ? rad*Math.sin(angle) : 0)};
    });
    if(n>1){
      const REPULSION = 9000, SPRING = 0.02, IDEAL_LEN = 130, CENTER_PULL = 0.01;
      for(let iter=0; iter<300; iter++){
        const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
        for(let i=0;i<n;i++){
          for(let j=i+1;j<n;j++){
            let dx = pos[i].x-pos[j].x, dy = pos[i].y-pos[j].y;
            let d2 = dx*dx+dy*dy; if(d2<1) d2=1;
            const d = Math.sqrt(d2);
            const f = REPULSION/d2;
            fx[i]+=f*dx/d; fy[i]+=f*dy/d;
            fx[j]-=f*dx/d; fy[j]-=f*dy/d;
          }
        }
        edges.forEach(e=>{
          const i=idx[e.from], j=idx[e.to];
          if(i==null||j==null||i===j) return;
          const dx = pos[j].x-pos[i].x, dy = pos[j].y-pos[i].y;
          const d = Math.hypot(dx,dy)||1;
          const f = SPRING*(d-IDEAL_LEN);
          fx[i]+=f*dx/d; fy[i]+=f*dy/d;
          fx[j]-=f*dx/d; fy[j]-=f*dy/d;
        });
        for(let i=0;i<n;i++){
          fx[i] += (cx-pos[i].x)*CENTER_PULL;
          fy[i] += (cy-pos[i].y)*CENTER_PULL;
          pos[i].x += fx[i]*0.5; pos[i].y += fy[i]*0.5;
        }
      }
      const margin = 55;
      pos.forEach(p=>{ p.x = Math.max(margin, Math.min(400-margin, p.x)); p.y = Math.max(margin, Math.min(400-margin, p.y)); });
    }
    return pos;
  }

  let best = null, bestScore = Infinity;
  const variants = (n>2 && edges.length>0) ? 6 : 1;
  for(let v=0; v<variants; v++){
    const pos = simulate(v);
    const crossings = countEdgeCrossings(pos, idx, edges);
    if(crossings < bestScore){ bestScore = crossings; best = pos; }
    if(bestScore===0) break;
  }
  relationLayoutCache = {key:layoutKey, pos:best};
  return list.map((node,i)=>({...node, x:best[i].x, y:best[i].y}));
}
function addRelationNode(){
  const id = uid();
  updateActive(camp=>({...camp, relationNodes:[...camp.relationNodes, {id, name:'Neu'}]}));
  saveState();
  startEditRelationNode(id);
}
function toggleRelationConnectMode(){
  ui.relationsConnectFrom = (ui.relationsConnectFrom==null) ? 'PENDING' : null;
  render();
}
function selectRelationNode(id){
  if(ui.relationsConnectFrom==='PENDING'){ ui.relationsConnectFrom=id; render(); return; }
  if(ui.relationsConnectFrom && ui.relationsConnectFrom!=='PENDING'){
    if(ui.relationsConnectFrom!==id) startNewRelationEdge(ui.relationsConnectFrom, id);
    ui.relationsConnectFrom=null; render(); return;
  }
  startEditRelationNode(id);
}
function startEditRelationNode(id){
  const active = getActive();
  const n = active.relationNodes.find(x=>x.id===id);
  if(!n) return;
  ui.editingRelationNodeId = id;
  ui.relationNodeDraft = {name:n.name};
  render();
}
function cancelRelationNodeModal(){ ui.editingRelationNodeId=null; ui.relationNodeDraft=null; render(); }
function saveRelationNode(){
  const id = ui.editingRelationNodeId, d = ui.relationNodeDraft;
  updateActive(camp=>({...camp, relationNodes: camp.relationNodes.map(n=>n.id===id?{...n, name:d.name.trim()||n.name}:n)}));
  ui.editingRelationNodeId=null; ui.relationNodeDraft=null;
  saveState(); render();
}
function deleteRelationNode(id){
  updateActive(camp=>({...camp,
    relationNodes: camp.relationNodes.filter(n=>n.id!==id),
    relationEdges: camp.relationEdges.filter(e=>e.from!==id && e.to!==id),
  }));
  ui.editingRelationNodeId=null; ui.relationNodeDraft=null;
  saveState(); render();
}
let relationLongPressTimer = null;
let relationLongPressFired = false;
function relationEdgePointerDown(evt, edgeId){
  relationLongPressFired = false;
  if(relationLongPressTimer) clearTimeout(relationLongPressTimer);
  relationLongPressTimer = setTimeout(()=>{ relationLongPressFired = true; startEditRelationEdge(edgeId); }, 450);
}
function relationEdgePointerUp(){
  if(relationLongPressTimer){ clearTimeout(relationLongPressTimer); relationLongPressTimer=null; }
}
function relationEdgeClick(evt, edgeId){
  evt.stopPropagation();
  if(relationLongPressFired){ relationLongPressFired=false; return; }
  rollRelationEdge(edgeId);
}
function rollRelationEdge(id){
  const active = getActive();
  const e = active.relationEdges.find(x=>x.id===id);
  if(!e) return;
  ui.relationRollResult = {edgeId:id, roll: rollDie(20), weight:e.weight};
  render();
}
function startNewRelationEdge(fromId, toId){
  ui.editingRelationEdgeId = 'new';
  ui.relationEdgeDraft = {from:fromId, to:toId, label:'kennt', weight:10};
  render();
}
function startEditRelationEdge(id){
  const active = getActive();
  const e = active.relationEdges.find(x=>x.id===id);
  if(!e) return;
  ui.editingRelationEdgeId = id;
  ui.relationEdgeDraft = {from:e.from, to:e.to, label:e.label, weight:e.weight};
  render();
}
function cancelRelationEdgeModal(){ ui.editingRelationEdgeId=null; ui.relationEdgeDraft=null; render(); }
function saveRelationEdge(){
  const d = ui.relationEdgeDraft;
  if(ui.editingRelationEdgeId==='new'){
    const id = uid();
    updateActive(camp=>({...camp, relationEdges:[...camp.relationEdges, {id, from:d.from, to:d.to, label:(d.label||'').trim()||'kennt', weight:Math.max(1,Math.min(20,parseInt(d.weight,10)||10))}]}));
  } else {
    const id = ui.editingRelationEdgeId;
    updateActive(camp=>({...camp, relationEdges: camp.relationEdges.map(e=>e.id===id?{...e, label:(d.label||'').trim()||e.label, weight:Math.max(1,Math.min(20,parseInt(d.weight,10)||e.weight))}:e)}));
  }
  ui.editingRelationEdgeId=null; ui.relationEdgeDraft=null;
  saveState(); render();
}
function deleteRelationEdge(id){
  updateActive(camp=>({...camp, relationEdges: camp.relationEdges.filter(e=>e.id!==id)}));
  ui.editingRelationEdgeId=null; ui.relationEdgeDraft=null;
  saveState(); render();
}
function renderRelationsTab(){
  const active = getActive();
  let html = '';
  if(ui.managing){
    const connectLabel = ui.relationsConnectFrom==='PENDING' ? '🔗 Ersten Knoten tippen…' : (ui.relationsConnectFrom ? '🔗 Zweiten Knoten tippen…' : '🔗 Verbinden');
    html += `<div class="row wrap" style="gap:8px;">
      <button class="btn btn-gold" style="padding:6px 10px;font-size:12px;" onclick="addRelationNode()">+ Person/Fraktion</button>
      <button class="btn ${ui.relationsConnectFrom?'btn-gold':'btn-raised'}" style="padding:6px 10px;font-size:12px;" onclick="toggleRelationConnectMode()">${connectLabel}</button>
    </div>`;
  }
  if(active.relationNodes.length===0){
    html += `<div class="panel empty"><span>Noch keine Personen/Fraktionen angelegt.</span>
      <button class="btn btn-raised" onclick="addRelationNode()">+ Erste anlegen</button></div>`;
    return html;
  }

  const nodes = getRelationLayout();
  const nodeBoxes = {};
  nodes.forEach(n=>{ nodeBoxes[n.id] = {w:nodeBoxWidth(n.name), h:34}; });
  const geoms = curvedEdgeGeometry(nodes, active.relationEdges, 26);
  const labelGeoms = geoms.map(g=>({cx:g.mx, cy:g.my, w:labelBoxWidth(`${g.edge.label} ${g.edge.weight}`), h:18, edgeId:g.edge.id}));
  resolveLabelOverlaps(labelGeoms, 8);
  const labelById = {}; labelGeoms.forEach(l=>labelById[l.edgeId]=l);

  // Same z-order fix as the Map tab: precompute each edge's clipped endpoints
  // once, then draw nodes BEFORE the edges so opaque node rectangles never
  // cover the connecting lines/labels, and keep a separate interactive
  // hit-layer (invisible line + label rect) drawn LAST/topmost so lines and
  // labels stay clickable without needing to sit under the nodes.
  const edgeGeoms = geoms.map(g=>{
    const A=g.A, B=g.B, e=g.edge;
    const boxA = nodeBoxes[A.id], boxB = nodeBoxes[B.id];
    const start = rectEdgePoint(A.x, A.y, boxA.w/2, boxA.h/2, g.mx, g.my);
    const end = rectEdgePoint(B.x, B.y, boxB.w/2, boxB.h/2, g.mx, g.my);
    return {g, e, start, end, lbl: labelById[e.id]};
  });
  const nodesSvg = nodes.map(n=>{
    const box = nodeBoxes[n.id];
    return `<g onclick="event.stopPropagation(); selectRelationNode('${n.id}')" style="cursor:pointer;">
      <rect x="${n.x-box.w/2}" y="${n.y-box.h/2}" width="${box.w}" height="${box.h}" rx="6" fill="var(--panel-raised)" stroke="var(--gold-dim)" stroke-width="2"></rect>
      <text x="${n.x}" y="${n.y+4}" text-anchor="middle" font-size="12" fill="var(--text)">${escapeHtml(n.name)}</text>
    </g>`;
  }).join('');
  const edgesSvg = edgeGeoms.map(({g,e,start,end,lbl})=>{
    const d = `M ${start.x} ${start.y} Q ${g.mx} ${g.my} ${end.x} ${end.y}`;
    return `<g style="pointer-events:none;">
      <path d="${d}" fill="none" stroke="var(--gold-dim)" stroke-width="2" marker-end="url(#rel-arrow)"></path>
      <rect x="${lbl.cx-lbl.w/2}" y="${lbl.cy-lbl.h/2}" width="${lbl.w}" height="${lbl.h}" rx="4" fill="var(--bg)" stroke="var(--border)"></rect>
      <text x="${lbl.cx}" y="${lbl.cy+4}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${escapeHtml(e.label)} ${escapeHtml(e.weight)}</text>
    </g>`;
  }).join('');
  // Two hit passes: every edge's wide line first, then every label on top.
  // Labels get pushed apart by resolveLabelOverlaps and often end up lying
  // across a *different* edge's 18px hit stroke — drawing all label hits
  // last guarantees tapping a label rolls that label's relationship.
  const hitAttrs = (id) => `style="cursor:pointer;pointer-events:all;"
        onpointerdown="relationEdgePointerDown(event,'${id}')" onpointerup="relationEdgePointerUp()" onpointerleave="relationEdgePointerUp()" onpointercancel="relationEdgePointerUp()"
        onclick="relationEdgeClick(event,'${id}')"`;
  const edgeHitSvg = edgeGeoms.map(({g,e,start,end})=>{
    const d = `M ${start.x} ${start.y} Q ${g.mx} ${g.my} ${end.x} ${end.y}`;
    return `<path d="${d}" fill="none" stroke="transparent" stroke-width="18" ${hitAttrs(e.id)}></path>`;
  }).join('') + edgeGeoms.map(({e,lbl})=>{
    const pad = 4;
    return `<rect x="${lbl.cx-lbl.w/2-pad}" y="${lbl.cy-lbl.h/2-pad}" width="${lbl.w+pad*2}" height="${lbl.h+pad*2}" fill="transparent" ${hitAttrs(e.id)}></rect>`;
  }).join('');

  html += `<div class="panel" style="padding:6px;">
    <div class="map-svg-wrap">
      <svg viewBox="0 0 400 400" width="400" height="400">
        <defs>
          <marker id="rel-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--gold-dim)"></path>
          </marker>
        </defs>
        ${nodesSvg}
        ${edgesSvg}
        ${edgeHitSvg}
      </svg>
    </div>
  </div>`;

  if(ui.relationRollResult){
    const rr = ui.relationRollResult;
    const re = active.relationEdges.find(x=>x.id===rr.edgeId);
    const nameOf = (id) => { const n = active.relationNodes.find(x=>x.id===id); return n ? n.name : '?'; };
    const what = re ? `${escapeHtml(nameOf(re.from))} → ${escapeHtml(re.label)} → ${escapeHtml(nameOf(re.to))}: ` : '';
    html += `<div class="panel"><div class="row between">
      <span style="font-size:15px;">🎲 ${what}Gerollt ${rr.roll} vs ${rr.weight}</span>
      <button class="icon-btn" onclick="ui.relationRollResult=null; render();">✕</button>
    </div></div>`;
  }
  html += `<p class="small-muted">Tippen = würfeln · Halten = Beziehung bearbeiten · Knoten tippen = umbenennen</p>`;
  return html;
}
function renderRelationNodeModal(){
  const d = ui.relationNodeDraft, id = ui.editingRelationNodeId;
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Umbenennen</span>
      <button class="icon-btn" onclick="cancelRelationNodeModal()">✕</button></div>
    <input type="text" value="${escapeHtml(d.name)}" placeholder="Name der Person/Fraktion" oninput="ui.relationNodeDraft.name=this.value;">
    <div class="row">
      <button class="btn btn-outline-wax" onclick="deleteRelationNode('${id}')">🗑 Löschen</button>
      <button class="btn btn-gold" style="flex:1;" onclick="saveRelationNode()">✓ Speichern</button>
    </div>
  </div></div>`;
}
function renderRelationEdgeModal(){
  const d = ui.relationEdgeDraft;
  const isNew = ui.editingRelationEdgeId==='new';
  const active = getActive();
  const fromNode = active.relationNodes.find(n=>n.id===d.from);
  const toNode = active.relationNodes.find(n=>n.id===d.to);
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?'Neue Beziehung':'Beziehung bearbeiten'}</span>
      <button class="icon-btn" onclick="cancelRelationEdgeModal()">✕</button></div>
    <span class="small-muted">${escapeHtml(fromNode?fromNode.name:'?')} → ${escapeHtml(toNode?toNode.name:'?')}</span>
    <input type="text" value="${escapeHtml(d.label)}" placeholder="Art der Beziehung (liebt, hasst, beneidet…)" oninput="ui.relationEdgeDraft.label=this.value;">
    <div class="row between">
      <span class="small-muted">Gewicht (Wahrscheinlichkeit, 1–20)</span>
      <span class="small-muted" id="relEdgeWVal">${d.weight}</span>
    </div>
    <input type="range" min="1" max="20" value="${d.weight}" oninput="ui.relationEdgeDraft.weight=this.value; document.getElementById('relEdgeWVal').textContent=this.value;">
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteRelationEdge('${ui.editingRelationEdgeId}')">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveRelationEdge()">✓ Speichern</button>
    </div>
  </div></div>`;
}
