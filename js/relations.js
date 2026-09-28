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
// Does segment p1-p2 pass through the axis-aligned box centered at c with
// half-sizes hw/hh? (Liang–Barsky clipping.)
function segmentHitsBox(p1, p2, c, hw, hh){
  const dx = p2.x-p1.x, dy = p2.y-p1.y;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if(p===0) return q>=0;
    const r = q/p;
    if(p<0){ if(r>t1) return false; if(r>t0) t0=r; }
    else { if(r<t0) return false; if(r<t1) t1=r; }
    return true;
  };
  return clip(-dx, p1.x-(c.x-hw)) && clip(dx, (c.x+hw)-p1.x)
      && clip(-dy, p1.y-(c.y-hh)) && clip(dy, (c.y+hh)-p1.y) && t0<=t1;
}
// Relationship-web layout. Nothing is stored; the layout is recomputed from
// the node/edge list (and cached until that changes). Quality, in priority:
//   1. no edges crossing each other
//   2. no edge running through another faction's box
//   3. no overlapping boxes
//   4. edges of similar length (a tidy, evenly spread web)
// Steps: a few force-directed runs give natural starting shapes; each is
// scaled to fit the canvas (not clamped, which squashes nodes onto the border
// and creates crossings). Then a local search moves single nodes to grid
// slots / nearby spots and swaps pairs of nodes whenever that lowers the
// penalty; while crossings remain, random "kicks" try to escape local minima.
// Seeded PRNG throughout, so the same graph always gets the same layout.
// It's a generator: it yields its best-so-far {size,pos,score,evals} between
// steps, so the caller can show a quick result and keep refining in the
// background without freezing the UI.
const REL_NODE_H = 34;
function* relationLayoutSearch(list, edgesIn, seedBase){
  const n = list.length;
  const size = n<=9 ? 400 : Math.round(400*Math.sqrt(n/9));
  const hw = list.map(node=>nodeBoxWidth(node.name)/2), hh = REL_NODE_H/2;
  const PAD = 8;
  const clampX = (i, x) => Math.max(hw[i]+PAD, Math.min(size-hw[i]-PAD, x));
  const clampY = (y) => Math.max(hh+PAD, Math.min(size-hh-PAD, y));
  if(n===1) return {size, pos:[{x:size/2, y:size/2}], score:0, evals:0};

  // Undirected, de-duplicated edges as index pairs (a->b and b->a draw as one pair).
  const idx = {}; list.forEach((node,i)=>idx[node.id]=i);
  const seen = new Map(), E = [];
  // Label box per drawn pair (sits at the edge midpoint). A two-way pair shows
  // two labels, one on each curve, so its box is taller.
  const labelW = [], labelH = [];
  edgesIn.forEach(e=>{
    const a = idx[e.from], b = idx[e.to];
    if(a==null || b==null || a===b) return;
    const k = a<b ? a+'-'+b : b+'-'+a;
    const w = labelBoxWidth(`${e.label||''} ${e.weight==null?'':e.weight}`);
    if(!seen.has(k)){ seen.set(k, E.length); E.push([a,b]); labelW.push(w); labelH.push(20); }
    else { const p = seen.get(k); labelW[p] = Math.max(labelW[p], w); labelH[p] = 72; }
  });
  const incident = list.map(()=>[]);
  E.forEach((e,k)=>{ incident[e[0]].push(k); incident[e[1]].push(k); });
  const IDEAL = Math.min(170, size/(Math.sqrt(n)+0.5));
  // A line through a faction box reads like a false connection, so it costs
  // more than a crossing.
  const W_CROSS = 1000, W_HIT = 1500, W_OVERLAP = 1500, W_LEN = 20;
  // Edge label covering a faction name: bad, but less than a crossing.
  const W_LABEL = 300;
  const labelOnNode = (a, k) => {
    const [a1,a2] = E[a];
    const mx = (pos_[a1].x+pos_[a2].x)/2, my = (pos_[a1].y+pos_[a2].y)/2;
    return Math.abs(mx-pos_[k].x) < labelW[a]/2+hw[k]+2 && Math.abs(my-pos_[k].y) < labelH[a]/2+hh+2;
  };
  let pos_ = null; // positions being scored (set by localScore)

  // Penalty of every term involving at least one node of `set`, each term
  // counted once — the delta of a move/swap is localScore(after)-localScore(before).
  const edgeMark = new Int32Array(E.length), nodeMark = new Int32Array(n);
  let stamp = 0;
  // Work budget in score evaluations (not wall time, so the result is the
  // same on every device and every launch).
  const BUDGET = 300000;
  let evals = 0;
  function localScore(pos, set){
    stamp++; evals++; pos_ = pos;
    const touched = [];
    set.forEach(i=>{ nodeMark[i]=stamp; incident[i].forEach(k=>{ if(edgeMark[k]!==stamp){ edgeMark[k]=stamp; touched.push(k); } }); });
    let s = 0;
    for(const a of touched){
      const [a1,a2] = E[a];
      for(let b=0;b<E.length;b++){
        if(b===a || (edgeMark[b]===stamp && b<a)) continue;
        const [b1,b2] = E[b];
        if(a1===b1||a1===b2||a2===b1||a2===b2) continue;
        if(segmentsIntersect(pos[a1],pos[a2],pos[b1],pos[b2])) s += W_CROSS;
      }
      for(let k=0;k<n;k++){
        if(labelOnNode(a,k)) s += W_LABEL;
        if(k===a1||k===a2) continue;
        if(segmentHitsBox(pos[a1],pos[a2],pos[k],hw[k]+4,hh+4)) s += W_HIT;
      }
      const len = Math.hypot(pos[a1].x-pos[a2].x, pos[a1].y-pos[a2].y);
      s += W_LEN*((len-IDEAL)/IDEAL)**2;
    }
    set.forEach(k=>{
      for(let b=0;b<E.length;b++){
        if(edgeMark[b]===stamp) continue;
        const [b1,b2] = E[b];
        if(segmentHitsBox(pos[b1],pos[b2],pos[k],hw[k]+4,hh+4)) s += W_HIT;
        if(labelOnNode(b,k)) s += W_LABEL;
      }
      for(let m=0;m<n;m++){
        if(m===k || (nodeMark[m]===stamp && m<k)) continue;
        if(Math.abs(pos[k].x-pos[m].x) < hw[k]+hw[m]+14 && Math.abs(pos[k].y-pos[m].y) < 2*hh+14) s += W_OVERLAP;
      }
    });
    return s;
  }
  const allNodes = list.map((_,i)=>i);
  const totalScore = (pos) => localScore(pos, allNodes);

  function forceLayout(rnd, fromCircle){
    const pos = list.map((node,i)=>{
      if(!fromCircle) return {x:rnd()*size, y:rnd()*size};
      const angle = (2*Math.PI*i/n) + (rnd()-0.5)*0.7;
      return {x:size/2+size*0.38*Math.cos(angle), y:size/2+size*0.38*Math.sin(angle)};
    });
    const REPULSION = IDEAL*IDEAL*0.6, SPRING = 0.03;
    for(let iter=0; iter<300; iter++){
      const cool = 1 - iter/300;
      const fx = new Float64Array(n), fy = new Float64Array(n);
      for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
        const dx = pos[i].x-pos[j].x, dy = pos[i].y-pos[j].y;
        const d2 = Math.max(dx*dx+dy*dy, 1), d = Math.sqrt(d2), f = REPULSION/d2;
        fx[i]+=f*dx/d; fy[i]+=f*dy/d; fx[j]-=f*dx/d; fy[j]-=f*dy/d;
      }
      E.forEach(([i,j])=>{
        const dx = pos[j].x-pos[i].x, dy = pos[j].y-pos[i].y;
        const d = Math.hypot(dx,dy)||1, f = SPRING*(d-IDEAL);
        fx[i]+=f*dx/d; fy[i]+=f*dy/d; fx[j]-=f*dx/d; fy[j]-=f*dy/d;
      });
      for(let i=0;i<n;i++){
        const step = Math.hypot(fx[i],fy[i]), max = 30*cool+1;
        const k = step>max ? max/step : 1;
        pos[i].x += fx[i]*k; pos[i].y += fy[i]*k;
      }
    }
    return fitToCanvas(pos);
  }
  // Stress layout: place nodes so on-screen distances match how many links
  // apart they are. Gives a good global shape (usually few crossings) that
  // complements the force layout. Gauss–Seidel SMACOF with weights 1/d².
  const hops = (()=>{
    const adj = list.map(()=>[]);
    E.forEach(([a,b])=>{ adj[a].push(b); adj[b].push(a); });
    const D = [];
    for(let s=0;s<n;s++){
      const d = new Array(n).fill(-1); d[s] = 0;
      const q = [s];
      for(let h=0; h<q.length; h++) adj[q[h]].forEach(t=>{ if(d[t]<0){ d[t]=d[q[h]]+1; q.push(t); } });
      D.push(d);
    }
    const maxD = Math.max(1, ...D.map(r=>Math.max(...r)));
    return D.map(r=>r.map(v=>v<0 ? maxD+1 : v)); // unconnected: just "far"
  })();
  function stressLayout(rnd){
    const pos = list.map(()=>({x:rnd()*size, y:rnd()*size}));
    for(let iter=0; iter<120; iter++){
      for(let i=0;i<n;i++){
        let nx=0, ny=0, den=0;
        for(let j=0;j<n;j++){
          if(j===i) continue;
          const d = hops[i][j]*IDEAL, w = 1/(d*d);
          const dx = pos[i].x-pos[j].x, dy = pos[i].y-pos[j].y;
          const dist = Math.hypot(dx,dy) || 1e-3;
          nx += w*(pos[j].x + d*dx/dist); ny += w*(pos[j].y + d*dy/dist); den += w;
        }
        pos[i] = {x:nx/den, y:ny/den};
      }
    }
    return fitToCanvas(pos);
  }
  // Scale into the canvas (keeps the shape; clamping would squash it).
  function fitToCanvas(pos){
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    pos.forEach(p=>{ x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); y0=Math.min(y0,p.y); y1=Math.max(y1,p.y); });
    const maxHw = Math.max(...hw);
    const ax = maxHw+PAD, bx = size-maxHw-PAD, ay = hh+PAD, by = size-hh-PAD;
    return pos.map((p,i)=>({
      x: clampX(i, x1>x0 ? ax+(p.x-x0)/(x1-x0)*(bx-ax) : size/2),
      y: clampY(y1>y0 ? ay+(p.y-y0)/(y1-y0)*(by-ay) : size/2),
    }));
  }

  // Candidate spots: an even grid with spare room, plus nearby nudges.
  const G = Math.ceil(Math.sqrt(n))+3;
  const slots = [];
  for(let gx=0; gx<G; gx++) for(let gy=0; gy<G; gy++){
    slots.push({x:(gx+0.5)*size/G, y:(gy+0.5)*size/G});
  }
  const NUDGES = [[-24,0],[24,0],[0,-24],[0,24],[-17,-17],[17,-17],[-17,17],[17,17]];

  // Generator: pauses after every node so background refinement stays smooth.
  function* localSearch(pos, maxPasses){
    for(let pass=0; pass<maxPasses && evals<BUDGET; pass++){
      let improved = false;
      for(let i=0;i<n;i++){
        const base = localScore(pos, [i]);
        const orig = pos[i];
        let bestD = -1e-6, bestP = null;
        const tryAt = (x, y) => {
          pos[i] = {x:clampX(i,x), y:clampY(y)};
          const d = localScore(pos, [i]) - base;
          if(d < bestD){ bestD = d; bestP = pos[i]; }
          pos[i] = orig;
        };
        slots.forEach(s=>tryAt(s.x, s.y));
        NUDGES.forEach(([dx,dy])=>tryAt(orig.x+dx, orig.y+dy));
        if(bestP){ pos[i] = bestP; improved = true; }
        // Swapping two nodes' places keeps the overall spacing intact.
        for(let j=0;j<n;j++){
          if(j===i) continue;
          const pi = pos[i], pj = pos[j];
          const before = localScore(pos, [i,j]);
          pos[i] = {x:clampX(i,pj.x), y:clampY(pj.y)};
          pos[j] = {x:clampX(j,pi.x), y:clampY(pi.y)};
          if(localScore(pos, [i,j]) - before < -1e-6){ improved = true; }
          else { pos[i] = pi; pos[j] = pj; }
        }
        yield snapshot();
      }
      if(!improved) break;
    }
    return pos;
  }

  // Nodes that take part in a crossing, a line-through-box or an overlap.
  function troubleNodes(pos){
    const bad = new Set();
    for(let a=0;a<E.length;a++){
      const [a1,a2] = E[a];
      for(let b=a+1;b<E.length;b++){
        const [b1,b2] = E[b];
        if(a1===b1||a1===b2||a2===b1||a2===b2) continue;
        if(segmentsIntersect(pos[a1],pos[a2],pos[b1],pos[b2])){ bad.add(a1); bad.add(a2); bad.add(b1); bad.add(b2); }
      }
      pos_ = pos;
      for(let k=0;k<n;k++){
        if(k!==a1 && k!==a2 && segmentHitsBox(pos[a1],pos[a2],pos[k],hw[k]+4,hh+4)){ bad.add(a1); bad.add(a2); bad.add(k); }
        if(labelOnNode(a,k)){ bad.add(a1); bad.add(a2); bad.add(k); }
      }
    }
    for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
      if(Math.abs(pos[i].x-pos[j].x) < hw[i]+hw[j]+14 && Math.abs(pos[i].y-pos[j].y) < 2*hh+14){ bad.add(i); bad.add(j); }
    }
    return [...bad];
  }

  const rnd = mulberry32(seedBase);
  let best = null, bestScore = Infinity;
  function snapshot(){ return {size, pos:best, score:bestScore, evals}; }
  // Starting shapes: stress layouts first (usually best), then force layouts.
  const kinds = n<=20 ? ['stress','stress','circle','stress','random','circle'] : ['stress','stress','circle','random'];
  for(let v=0; v<kinds.length && evals<BUDGET; v++){
    const start = kinds[v]==='stress' ? stressLayout(rnd) : forceLayout(rnd, kinds[v]==='circle');
    const pos = yield* localSearch(start, 12);
    const sc = totalScore(pos);
    if(sc < bestScore){ bestScore = sc; best = pos; }
    if(!troubleNodes(best).length) break; // nothing left to fix
    yield snapshot();
  }
  // Still a crossing / covered label? Move one or two of the nodes involved
  // somewhere else, re-optimize briefly, keep it if the whole picture improved.
  while(evals < BUDGET){
    const bad = troubleNodes(best);
    if(!bad.length) break;
    const pos = best.map(p=>({...p}));
    const moves = 1 + Math.floor(rnd()*2);
    for(let m=0;m<moves;m++){
      const i = bad[Math.floor(rnd()*bad.length)], s = slots[Math.floor(rnd()*slots.length)];
      pos[i] = {x:clampX(i,s.x), y:clampY(s.y)};
    }
    yield* localSearch(pos, 4);
    const sc = totalScore(pos);
    if(sc < bestScore){ bestScore = sc; best = pos; }
    yield snapshot();
  }
  return snapshot();
}
// Runs the search synchronously (tests / small graphs): the final result.
function computeRelationLayout(list, edges, seedBase){
  const gen = relationLayoutSearch(list, edges, seedBase);
  let r; do { r = gen.next(); } while(!r.done);
  return r.value;
}
// ---- Several webs per campaign (per region, scale, ...) ----
function getCurrentRelationMap(){
  const active = getActive();
  return active.relationMaps.find(m=>m.id===active.activeRelationMapId) || active.relationMaps[0] || null;
}
function updateRelationMap(mapId, updater){
  updateActive(camp=>({...camp, relationMaps: camp.relationMaps.map(m=>m.id===mapId ? updater(m) : m)}));
}
function updateCurrentRelationMap(updater){
  const cur = getCurrentRelationMap();
  if(cur) updateRelationMap(cur.id, updater);
}
function resetRelationView(){
  ui.relationsConnectFrom=null; ui.relationRollResult=null; ui.confirmDeleteRelationMapId=null;
  resetZoomScroll('rel');
}
function setActiveRelationMap(id){
  updateActive(camp=>({...camp, activeRelationMapId:id}));
  resetRelationView();
  saveState(); render();
}
function addRelationMap(){
  const id = uid();
  updateActive(camp=>({...camp,
    relationMaps:[...camp.relationMaps, {id, name:'Netz '+(camp.relationMaps.length+1), nodes:[], edges:[], layout:null}],
    activeRelationMapId:id}));
  resetRelationView();
  saveState(); render();
}
function onRelationMapNameInput(el){ updateCurrentRelationMap(m=>({...m, name:el.value})); saveState(); }
function askDeleteRelationMap(id){ ui.confirmDeleteRelationMapId=id; render(); }
function deleteRelationMap(id){
  backupNow('Vor Löschen eines Beziehungsnetzes');
  updateActive(camp=>{
    const relationMaps = camp.relationMaps.filter(m=>m.id!==id);
    return {...camp, relationMaps, activeRelationMapId: camp.activeRelationMapId===id ? (relationMaps[0]?relationMaps[0].id:null) : camp.activeRelationMapId};
  });
  resetRelationView();
  saveState(); render();
}

// ---- Layout driver ----
// Layout keyed on web id, node ids+names (box widths) and edge endpoints, so
// relabeling an edge or re-rendering reuses it. The finished layout is saved
// in the web (map.layout), so it's computed once, not every launch.
// A new graph shows the result of a quick first search right away; if that
// still has crossings, the search continues in small background slices and
// the picture updates when it improves.
const REL_LAYOUT_SYNC_EVALS = 30000;
let relationLayoutCache = {key:null, pos:null, size:400, score:Infinity};
function relationLayoutKey(map){
  return map.id + '#' + map.nodes.map(node=>node.id+':'+node.name).join(',') + '|' + map.edges.map(e=>e.from+'>'+e.to).join(',');
}
function getRelationLayout(map){
  const list = map.nodes;
  if(list.length===0) return [];
  const edges = map.edges;
  const layoutKey = relationLayoutKey(map);
  if(relationLayoutCache.key!==layoutKey){
    const saved = map.layout;
    if(saved && saved.key===layoutKey && Array.isArray(saved.pos) && saved.pos.length===list.length){
      relationLayoutCache = {key:layoutKey, size:saved.size||400, score:0, pos:saved.pos.map(([x,y])=>({x,y}))};
    } else {
      const seed = hashStr(list.map(node=>node.id).join(',') + '|' + edges.map(e=>e.from+'>'+e.to).join(','));
      const gen = relationLayoutSearch(list, edges, seed);
      let r;
      do { r = gen.next(); } while(!r.done && (r.value.evals < REL_LAYOUT_SYNC_EVALS || !r.value.pos));
      relationLayoutCache = {key:layoutKey, ...r.value};
      const target = {campId:STATE.activeCampaignId, mapId:map.id, key:layoutKey};
      if(r.done) saveRelationLayout(target);
      else setTimeout(()=>refineRelationLayout(gen, target), 50);
    }
  }
  return list.map((node,i)=>({...node, x:relationLayoutCache.pos[i].x, y:relationLayoutCache.pos[i].y}));
}
function refineRelationLayout(gen, target){
  // Stop if the web changed, or another web/campaign is shown meanwhile.
  if(relationLayoutCache.key!==target.key || STATE.activeCampaignId!==target.campId) return;
  const t0 = performance.now();
  let r;
  do { r = gen.next(); } while(!r.done && performance.now()-t0 < 25);
  if(r.value.pos && r.value.score < relationLayoutCache.score){
    relationLayoutCache = {key:target.key, ...r.value};
    // Re-render only if it's visible and nobody is typing somewhere.
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT';
    const active = getActive();
    const visible = ui.activeTab==='relations' || (active.splitView && active.pinnedTabs.includes('relations'));
    if(visible && !typing) render();
  }
  if(r.done) saveRelationLayout(target);
  else setTimeout(()=>refineRelationLayout(gen, target), 0);
}
function saveRelationLayout(target){
  const c = relationLayoutCache;
  if(c.key!==target.key || STATE.activeCampaignId!==target.campId) return;
  const layout = {key:target.key, size:c.size, pos:c.pos.map(p=>[Math.round(p.x*10)/10, Math.round(p.y*10)/10])};
  updateRelationMap(target.mapId, m=>({...m, layout}));
  saveState();
}

// ---- Factions & relationships (in the current web) ----
function addRelationNode(){
  const id = uid();
  updateCurrentRelationMap(m=>({...m, nodes:[...m.nodes, {id, name:'Neu'}]}));
  saveState();
  startEditRelationNode(id);
}
// Tapping factions connects them: first tap selects, tap on a second faction
// opens "new relationship" for the pair, tapping the selected one again (or
// empty space) cancels. Editing a faction is explicit: hold it, or use the
// ✎ button in the selection bar.
function relationNodeClick(evt, id){
  evt.stopPropagation();
  if(relationLongPressFired){ relationLongPressFired=false; return; }
  const from = ui.relationsConnectFrom;
  if(!from){ ui.relationsConnectFrom = id; render(); return; }
  ui.relationsConnectFrom = null;
  if(from===id){ render(); return; }
  startNewRelationEdge(from, id);
}
function relationNodePointerDown(evt, id){
  relationLongPressFired = false;
  if(relationLongPressTimer) clearTimeout(relationLongPressTimer);
  relationLongPressTimer = setTimeout(()=>{
    relationLongPressFired = true; ui.relationsConnectFrom = null; startEditRelationNode(id);
  }, 450);
}
function editSelectedRelationNode(){
  const id = ui.relationsConnectFrom;
  ui.relationsConnectFrom = null;
  if(id) startEditRelationNode(id);
}
function cancelRelationSelection(){
  if(ui.relationsConnectFrom){ ui.relationsConnectFrom = null; render(); }
}
function startEditRelationNode(id){
  const cur = getCurrentRelationMap();
  const n = cur && cur.nodes.find(x=>x.id===id);
  if(!n) return;
  ui.editingRelationNodeId = id;
  ui.relationNodeDraft = {name:n.name};
  render();
}
function cancelRelationNodeModal(){ ui.editingRelationNodeId=null; ui.relationNodeDraft=null; render(); }
function saveRelationNode(){
  const id = ui.editingRelationNodeId, d = ui.relationNodeDraft;
  updateCurrentRelationMap(m=>({...m, nodes: m.nodes.map(n=>n.id===id?{...n, name:d.name.trim()||n.name}:n)}));
  ui.editingRelationNodeId=null; ui.relationNodeDraft=null;
  saveState(); render();
}
function deleteRelationNode(id){
  updateCurrentRelationMap(m=>({...m,
    nodes: m.nodes.filter(n=>n.id!==id),
    edges: m.edges.filter(e=>e.from!==id && e.to!==id),
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
  const cur = getCurrentRelationMap();
  const e = cur && cur.edges.find(x=>x.id===id);
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
  const cur = getCurrentRelationMap();
  const e = cur && cur.edges.find(x=>x.id===id);
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
    updateCurrentRelationMap(m=>({...m, edges:[...m.edges, {id, from:d.from, to:d.to, label:(d.label||'').trim()||'kennt', weight:Math.max(1,Math.min(20,parseInt(d.weight,10)||10))}]}));
  } else {
    const id = ui.editingRelationEdgeId;
    updateCurrentRelationMap(m=>({...m, edges: m.edges.map(e=>e.id===id?{...e, label:(d.label||'').trim()||e.label, weight:Math.max(1,Math.min(20,parseInt(d.weight,10)||e.weight))}:e)}));
  }
  ui.editingRelationEdgeId=null; ui.relationEdgeDraft=null;
  saveState(); render();
}
function deleteRelationEdge(id){
  updateCurrentRelationMap(m=>({...m, edges: m.edges.filter(e=>e.id!==id)}));
  ui.editingRelationEdgeId=null; ui.relationEdgeDraft=null;
  saveState(); render();
}

function renderRelationsTab(){
  const active = getActive();
  const cur = getCurrentRelationMap();
  let html = `<div class="pill-scroll">`;
  html += active.relationMaps.map(m=>`<button class="pill ${cur&&m.id===cur.id?'active':'inactive'}" onclick="setActiveRelationMap('${m.id}')">${escapeHtml(m.name)}</button>`).join('');
  html += `<button class="icon-btn raised" style="border-radius:999px;" title="Neues Beziehungsnetz" onclick="addRelationMap()">+</button>`;
  html += `</div>`;
  if(!cur){
    html += `<div class="panel empty"><span>Noch kein Beziehungsnetz angelegt — z.B. eins pro Stadt, Region oder Königreich.</span>
      <button class="btn btn-raised" onclick="addRelationMap()">+ Erstes Netz anlegen</button></div>`;
    return html;
  }
  if(ui.managing){
    const confirming = ui.confirmDeleteRelationMapId===cur.id;
    html += `<div class="panel" style="gap:8px;">
      <input type="text" value="${escapeHtml(cur.name)}" placeholder="Name des Netzes (z.B. Hafenstadt, Königreich)" oninput="onRelationMapNameInput(this)" onchange="render()">
      <div class="row wrap" style="gap:8px;">
        <button class="btn btn-gold" style="padding:6px 10px;font-size:12px;" onclick="addRelationNode()">+ Person/Fraktion</button>
        ${confirming
          ? `<span class="row" style="gap:6px;margin-left:auto;">
               <button class="btn" style="background:var(--wax);color:var(--text);padding:6px 10px;font-size:12px;" onclick="deleteRelationMap('${cur.id}')">Wirklich löschen</button>
               <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="ui.confirmDeleteRelationMapId=null; render();">Abbrechen</button>
             </span>`
          : `<button class="btn btn-outline-wax" style="padding:6px 10px;font-size:12px;margin-left:auto;" onclick="askDeleteRelationMap('${cur.id}')">🗑 Netz löschen</button>`}
      </div>
    </div>`;
  }
  if(cur.nodes.length===0){
    html += `<div class="panel empty"><span>Noch keine Personen/Fraktionen in „${escapeHtml(cur.name)}“.</span>
      <button class="btn btn-raised" onclick="addRelationNode()">+ Erste anlegen</button></div>`;
    return html;
  }

  const nodes = getRelationLayout(cur);
  const size = relationLayoutCache.size;
  const nodeBoxes = {};
  nodes.forEach(n=>{ nodeBoxes[n.id] = {w:nodeBoxWidth(n.name), h:34}; });
  const geoms = curvedEdgeGeometry(nodes, cur.edges, 26);
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
    const selected = ui.relationsConnectFrom===n.id;
    return `<g onclick="relationNodeClick(event,'${n.id}')" onpointerdown="relationNodePointerDown(event,'${n.id}')"
        onpointerup="relationEdgePointerUp()" onpointerleave="relationEdgePointerUp()" onpointercancel="relationEdgePointerUp()" style="cursor:pointer;">
      <rect x="${n.x-box.w/2}" y="${n.y-box.h/2}" width="${box.w}" height="${box.h}" rx="6" fill="${selected?'var(--gold-dim)':'var(--panel-raised)'}" stroke="${selected?'var(--gold)':'var(--gold-dim)'}" stroke-width="${selected?3:2}"></rect>
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

  const selNode = ui.relationsConnectFrom && cur.nodes.find(n=>n.id===ui.relationsConnectFrom);
  if(ui.relationsConnectFrom && !selNode) ui.relationsConnectFrom = null;
  // Lives in the always-present row under the web, so selecting doesn't shift
  // the drawing right before the second tap.
  const selectionInfo = selNode
    ? `<span style="font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><b style="color:var(--gold);">${escapeHtml(selNode.name)}</b> → zweite tippen</span>
       <button class="icon-btn raised" title="${escapeHtml(selNode.name)} bearbeiten" onclick="editSelectedRelationNode()">✎</button>
       <button class="icon-btn raised" title="Auswahl aufheben" onclick="cancelRelationSelection()">✕</button>`
    : `<span class="small-muted" style="min-width:0;">Person antippen, um eine Beziehung zu ziehen</span>`;
  html += `<div class="panel" style="padding:6px;gap:6px;">
    <div class="map-svg-wrap" ${zoomWrapAttrs('rel', '1 / 1')}>
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="${zoomSvgStyle('rel')}" onclick="cancelRelationSelection()">
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
    <div class="row" style="gap:4px;">
      ${selectionInfo}
      <span style="flex:1;"></span>
      ${zoomControlsHtml('rel','Ganzes Netz zeigen')}
    </div>
  </div>`;

  if(ui.relationRollResult){
    const rr = ui.relationRollResult;
    const re = cur.edges.find(x=>x.id===rr.edgeId);
    const nameOf = (id) => { const n = cur.nodes.find(x=>x.id===id); return n ? n.name : '?'; };
    const what = re ? `${escapeHtml(nameOf(re.from))} → ${escapeHtml(re.label)} → ${escapeHtml(nameOf(re.to))}: ` : '';
    html += `<div class="panel"><div class="row between">
      <span style="font-size:15px;">🎲 ${what}Gerollt ${rr.roll} vs ${rr.weight}</span>
      <button class="icon-btn" onclick="ui.relationRollResult=null; render();">✕</button>
    </div></div>`;
  }
  html += `<p class="small-muted">Beziehung tippen = würfeln, halten = bearbeiten · Zwei Personen nacheinander tippen = verbinden, halten = bearbeiten · Zwei Finger / Strg+Mausrad = zoomen</p>`;
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
  const cur = getCurrentRelationMap();
  const nodes = cur ? cur.nodes : [];
  const fromNode = nodes.find(n=>n.id===d.from);
  const toNode = nodes.find(n=>n.id===d.to);
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
