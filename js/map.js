// Karte tab: dungeon / hex-crawl node maps.
// ============================================================
// Karte (dungeon / hex-crawl node maps)
// ============================================================
function getCurrentMap(){
  const active = getActive();
  return active.maps.find(m=>m.id===active.activeMapId) || active.maps[0] || null;
}
function updateCurrentMap(updater){
  const cur = getCurrentMap();
  if(!cur) return;
  updateActive(camp=>({...camp, maps: camp.maps.map(m=>m.id===cur.id ? updater(m) : m)}));
}
function setActiveMapId(id){
  updateActive(camp=>({...camp, activeMapId:id}));
  ui.selectedMapNodeId=null; ui.mapMoveArmedId=null; ui.mapConnectFrom=null;
  saveState(); render();
}
function addMap(){
  const id = uid();
  updateActive(camp=>({...camp, maps:[...camp.maps, {id, name:'Karte '+(camp.maps.length+1), description:'', markerNodeId:null, grid:'square', gridSize:40, nodes:[], edges:[]}], activeMapId:id}));
  saveState(); render();
}
function deleteMap(id){
  updateActive(camp=>{
    const maps = camp.maps.filter(m=>m.id!==id);
    return {...camp, maps, activeMapId: camp.activeMapId===id ? (maps[0]?maps[0].id:null) : camp.activeMapId};
  });
  ui.selectedMapNodeId=null; ui.mapMoveArmedId=null; ui.mapConnectFrom=null;
  saveState(); render();
}
function onMapNameInput(el){ updateCurrentMap(m=>({...m, name:el.value})); saveState(); }
function onMapDescInput(el){ updateCurrentMap(m=>({...m, description:el.value})); saveState(); }
function onSelectedMapNodeNameInput(id, el){
  updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>n.id===id?{...n, name:el.value}:n)}));
  saveState();
}
function onSelectedMapNodeDescInput(id, el){
  updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>n.id===id?{...n, desc:el.value}:n)}));
  saveState();
}
function addMapNode(){
  const cur = getCurrentMap();
  if(!cur) return;
  const idx = cur.nodes.length;
  addMapNodeAt(60+(idx%4)*80, 50+Math.floor(idx/4)*80);
}
function addMapNodeAt(x, y, brush){
  const cur = getCurrentMap();
  if(!cur) return;
  const idx = cur.nodes.length;
  const snapped = snapToMapGrid(cur, x, y);
  const t = brush && TERRAIN_BY_ID[brush];
  const s = brush && brush.startsWith('set:') && SETTLEMENT_BY_ID[brush.slice(4)];
  const def = t || s;
  const area = (ui.mapAreaBrush||'').trim();
  const node = {id:uid(), name: def ? def.label : (area || 'Raum '+(idx+1)), num: String(idx+1), x:snapped.x, y:snapped.y, r:16, desc:'',
    terrain: t ? brush : null, settlement: s ? s.id : null, area};
  updateCurrentMap(m=>({...m, nodes:[...m.nodes, node]}));
  saveState(); render();
}
function setMapGridType(type){
  // Switching to squares: put every room into a cell.
  updateCurrentMap(m=>({...m, grid:type, nodes: type==='square'
    ? m.nodes.map(n=>({...n, ...squareGridSnap(n.x, n.y, m.gridSize)}))
    : m.nodes}));
  saveState(); render();
}
function onMapGridSizeInput(el){
  const newSize = parseInt(el.value,10)||40;
  updateCurrentMap(m=>{
    const oldSize = m.gridSize||40;
    if(oldSize===newSize) return m;
    const scale = newSize/oldSize;
    let nodes;
    if(m.grid==='hex'){
      // Reproject each room's axial hex coordinate at the new cell size, so
      // rooms keep their relative position on the (resized) hex grid instead
      // of drifting off it.
      nodes = m.nodes.map(n=>{
        const {q,r} = hexPixelToAxial(n.x, n.y, oldSize);
        const rounded = hexRound(q, r);
        const px = hexAxialToPixel(rounded.q, rounded.r, newSize);
        return {...n, x:Math.round(px.x), y:Math.round(px.y)};
      });
    } else {
      // Scale every room's position from the grid origin by the same factor
      // the grid itself just scaled by, then re-snap onto the resized grid.
      nodes = m.nodes.map(n=>{
        const scaledMap = {grid:m.grid, gridSize:newSize};
        const snapped = snapToMapGrid(scaledMap, n.x*scale, n.y*scale);
        return {...n, x:snapped.x, y:snapped.y};
      });
    }
    return {...m, gridSize:newSize, nodes};
  });
  saveState(); render();
}
function toggleMapConnectMode(){
  ui.mapMoveArmedId = null; ui.mapBrush = null;
  ui.mapConnectFrom = (ui.mapConnectFrom==null) ? 'PENDING' : null;
  render();
}
// Brush (manage mode): tapping empty space creates a hex with it, tapping an
// existing hex applies it. Values: a terrain id; 'set:city' / 'set:town'
// (settlement on top of the terrain — applying the same one again removes
// it); '__clear' (removes terrain and settlement).
function setMapBrush(id){
  ui.mapBrush = (ui.mapBrush===id) ? null : id;
  ui.mapConnectFrom = null; ui.mapMoveArmedId = null;
  render();
}
function applyBrushToNode(n, brush){
  if(!brush) return n;
  if(brush==='__clear') return {...n, terrain:null, settlement:null};
  if(brush.startsWith('set:')){
    const s = brush.slice(4);
    return {...n, settlement: n.settlement===s ? null : s};
  }
  return {...n, terrain: brush};
}
function paintMapNode(id, brush){
  updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>n.id===id ? applyBrushToNode(n, brush) : n)}));
  saveState(); render();
}
// Applies the terrain/settlement brush and the area brush (both optional).
function applyBrushesToNode(id){
  const area = (ui.mapAreaBrush||'').trim();
  updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>{
    if(n.id!==id) return n;
    const painted = applyBrushToNode(n, ui.mapBrush);
    return area ? {...painted, area} : painted;
  })}));
  saveState(); render();
}
function onMapAreaBrushInput(el){ ui.mapAreaBrush = el.value; }
// Table names offered for areas: tables that aren't terrain sub-tables
// ("Forest: ANIMAL 1") — i.e. the area/region tables.
function areaTableNames(){
  return getActive().tables.map(t=>t.name).filter(n=>!/: [A-Z]/.test(n));
}
function areaDatalistHtml(){
  return `<datalist id="area-table-names">${areaTableNames().map(n=>`<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>`;
}
// Moves the 📍 party marker here and rolls this hex's area table (which
// resolves {{@terrain: …}} against this hex). The result also goes to the
// Orakel log; it's shown on the map too.
function travelAndEncounter(id){
  updateCurrentMap(m=>({...m, markerNodeId:id}));
  saveState();
  rollAreaEncounter();
  const top = getActive().log[0];
  ui.mapEncounterResult = top ? top.text : null;
  render();
}
function brushLabel(brush){
  if(brush==='__clear') return 'Gelände & Siedlung entfernen';
  if(brush.startsWith('set:')) return SETTLEMENT_BY_ID[brush.slice(4)].label;
  return TERRAIN_BY_ID[brush].label;
}
function armMoveMapNode(id){ ui.mapConnectFrom=null; ui.mapBrush=null; ui.mapMoveArmedId=id; render(); }
function cancelMoveMapNode(){ ui.mapMoveArmedId=null; render(); }
function selectMapNode(id){
  if(ui.managing){
    if(ui.mapConnectFrom==='PENDING'){ ui.mapConnectFrom=id; render(); return; }
    if(ui.mapConnectFrom && ui.mapConnectFrom!=='PENDING'){
      if(ui.mapConnectFrom!==id) startNewMapEdge(ui.mapConnectFrom, id);
      ui.mapConnectFrom=null; render(); return;
    }
    if(ui.mapMoveArmedId) return;
    if(ui.mapBrush || (ui.mapAreaBrush||'').trim()){ applyBrushesToNode(id); return; }
    startEditMapNode(id);
    return;
  }
  ui.selectedMapNodeId = (ui.selectedMapNodeId===id) ? null : id;
  render();
}
function onMapCanvasClick(evt){
  if(!ui.managing) return;
  const svg = evt.currentTarget;
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const x = Math.round((evt.clientX-rect.left)/rect.width*vb.width + vb.x);
  const y = Math.round((evt.clientY-rect.top)/rect.height*vb.height + vb.y);
  if(ui.mapMoveArmedId){
    const id = ui.mapMoveArmedId;
    const cur = getCurrentMap();
    const snapped = snapToMapGrid(cur, x, y);
    updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>n.id===id?{...n,x:snapped.x,y:snapped.y}:n)}));
    ui.mapMoveArmedId=null;
    saveState(); render();
    return;
  }
  if(ui.mapConnectFrom){
    // tapping empty space cancels an in-progress connection instead of adding a room
    ui.mapConnectFrom=null; render();
    return;
  }
  addMapNodeAt(x, y, ui.mapBrush && ui.mapBrush!=='__clear' ? ui.mapBrush : null);
}
function setMarkerHere(nodeId){
  updateCurrentMap(m=>({...m, markerNodeId:nodeId}));
  saveState(); render();
}
function startEditMapNode(id){
  const cur = getCurrentMap();
  const n = cur && cur.nodes.find(x=>x.id===id);
  if(!n) return;
  ui.editingMapNodeId = id;
  ui.mapNodeDraft = {name:n.name, num:n.num, desc:n.desc, r:n.r, terrain:n.terrain||null, settlement:n.settlement||null, area:n.area||''};
  render();
}
function cancelMapNodeModal(){ ui.editingMapNodeId=null; ui.mapNodeDraft=null; render(); }
function saveMapNode(){
  const id = ui.editingMapNodeId, d = ui.mapNodeDraft;
  updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>n.id===id?{
    ...n,
    name: d.name.trim() || n.name,
    num: (d.num!=null && String(d.num).trim()!=='') ? String(d.num).trim() : n.num,
    desc: d.desc,
    r: Math.max(10, Math.min(40, parseInt(d.r,10)||n.r)),
    terrain: d.terrain || null,
    settlement: d.settlement || null,
    area: (d.area||'').trim(),
  }:n)}));
  ui.editingMapNodeId=null; ui.mapNodeDraft=null;
  saveState(); render();
}
function deleteMapNode(id){
  updateCurrentMap(m=>({...m,
    nodes: m.nodes.filter(n=>n.id!==id),
    edges: m.edges.filter(e=>e.from!==id && e.to!==id),
    markerNodeId: m.markerNodeId===id ? null : m.markerNodeId,
  }));
  if(ui.selectedMapNodeId===id) ui.selectedMapNodeId=null;
  ui.editingMapNodeId=null; ui.mapNodeDraft=null;
  saveState(); render();
}
function startNewMapEdge(fromId, toId){
  ui.editingMapEdgeId = 'new';
  ui.mapEdgeDraft = {from:fromId, to:toId, type:'open', oneway:false};
  render();
}
function startEditMapEdge(id){
  const cur = getCurrentMap();
  const e = cur && cur.edges.find(x=>x.id===id);
  if(!e) return;
  ui.editingMapEdgeId = id;
  ui.mapEdgeDraft = {from:e.from, to:e.to, type:e.type, oneway:e.oneway};
  render();
}
function cancelMapEdgeModal(){ ui.editingMapEdgeId=null; ui.mapEdgeDraft=null; render(); }
function setMapEdgeDraftType(type){ ui.mapEdgeDraft.type=type; render(); }
function toggleMapEdgeDraftOneway(){ ui.mapEdgeDraft.oneway=!ui.mapEdgeDraft.oneway; render(); }
function saveMapEdge(){
  const d = ui.mapEdgeDraft;
  if(ui.editingMapEdgeId==='new'){
    const id = uid();
    updateCurrentMap(m=>({...m, edges:[...m.edges, {id, from:d.from, to:d.to, type:d.type, oneway:d.oneway}]}));
  } else {
    const id = ui.editingMapEdgeId;
    updateCurrentMap(m=>({...m, edges: m.edges.map(e=>e.id===id?{...e, type:d.type, oneway:d.oneway}:e)}));
  }
  ui.editingMapEdgeId=null; ui.mapEdgeDraft=null;
  saveState(); render();
}
function deleteMapEdge(id){
  updateCurrentMap(m=>({...m, edges: m.edges.filter(e=>e.id!==id)}));
  ui.editingMapEdgeId=null; ui.mapEdgeDraft=null;
  saveState(); render();
}
// ---- Map drawing: one persistent <svg>, updated in place ----
// render() rebuilds the page as HTML, but the map SVG is kept between renders
// and patched: the hex layer only replaces hexes whose drawing changed, and
// selection, move
// target, 📍 marker, connections and grid are small separate layers. So a
// tap on a map with thousands of hexes costs about the same as on a small one.
const SVG_NS = 'http://www.w3.org/2000/svg';
let mapDom = null; // {svg, mapId, grid, gridSize, images, defsKey, gridKey, nodeEls: Map(id -> {markup, el}), order: [ids]}
function svgFromMarkup(markup){
  const tmp = document.createElementNS(SVG_NS, 'svg');
  tmp.innerHTML = markup;
  return tmp.firstElementChild;
}
function mapNodeRadius(cur, n){ return cur.grid==='hex' ? cur.gridSize : n.r; }
// One hex/room, independent of UI state (selection etc. live in the overlay).
function mapNodeMarkup(cur, n){
  const hexMode = cur.grid==='hex';
  const r = mapNodeRadius(cur, n);
  const tileFill = terrainFill(n.terrain) || terrainFill(n.settlement);
  const tile = hexMode
    ? hexTileUseSvg(n.terrain, n.settlement, n.x, n.y, r, TERRAIN_INK, 1)
    : mapTileSvg(n.terrain, n.settlement, n.x, n.y, r, false, TERRAIN_INK, 1);
  const shape = tile || (hexMode
    ? `<polygon points="${hexCornersPoints(n.x,n.y,r)}" fill="var(--panel-raised)" stroke="var(--border)" stroke-width="2"></polygon>`
    : `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="var(--panel-raised)" stroke="var(--border)" stroke-width="2"></circle>`);
  // On a tile the number sits at the lower edge with a halo, so the symbol stays visible.
  const numText = tile
    ? `<text x="${n.x}" y="${n.y + r*0.8}" text-anchor="middle" font-size="${hexMode ? Math.max(8, r*0.28).toFixed(1) : 9}" font-weight="700" fill="${TERRAIN_INK}" stroke="${tileFill}" stroke-width="3" paint-order="stroke" style="pointer-events:none;">${escapeHtml(n.num)}</text>`
    : `<text x="${n.x}" y="${n.y+4}" text-anchor="middle" font-size="12" fill="var(--text)" style="pointer-events:none;">${escapeHtml(n.num)}</text>`;
  return `<g onclick="event.stopPropagation(); selectMapNode('${n.id}')" style="cursor:pointer;">${shape}${numText}</g>`;
}
// Selection / move target outlines and the 📍 party marker.
function mapOverlayMarkup(cur){
  const hexMode = cur.grid==='hex';
  const outline = (n, color) => {
    const r = mapNodeRadius(cur, n);
    return hexMode
      ? `<polygon points="${hexCornersPoints(n.x,n.y,r)}" fill="none" stroke="${color}" stroke-width="4"></polygon>`
      : `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="none" stroke="${color}" stroke-width="4"></circle>`;
  };
  let out = '';
  const byId = id => id ? cur.nodes.find(n=>n.id===id) : null;
  const sel = byId(ui.selectedMapNodeId), armed = byId(ui.mapMoveArmedId), marker = byId(cur.markerNodeId);
  if(sel) out += outline(sel, 'var(--gold)');
  if(armed) out += outline(armed, 'var(--wax)');
  if(marker){
    // A small pin above the room, so it doesn't compete with the selection outline.
    const n = marker, r = mapNodeRadius(cur, n);
    const topR = hexMode ? hexApothem(cur.gridSize) : r;
    const bulbR = 6.5, tailLen = 9, gap = 3;
    const tipY = n.y - topR - gap, bulbCy = tipY - tailLen;
    out += `<polygon points="${n.x-3.2},${(bulbCy+bulbR-1).toFixed(1)} ${n.x+3.2},${(bulbCy+bulbR-1).toFixed(1)} ${n.x},${tipY}" fill="var(--gold)"></polygon>
      <circle cx="${n.x}" cy="${bulbCy}" r="${bulbR}" fill="var(--gold)" stroke="var(--bg)" stroke-width="1.4"></circle>
      <circle cx="${n.x}" cy="${bulbCy}" r="2.6" fill="var(--bg)"></circle>`;
  }
  return out;
}
// Visible connections and (manage mode) their tap targets.
function mapEdgesMarkup(cur){
  const hexMode = cur.grid==='hex';
  const geoms = curvedEdgeGeometry(cur.nodes, cur.edges, 18);
  // Touching hex cells leave zero line length between them — then a small
  // doorway marker on the shared wall stands in for the line.
  const edgeGeoms = geoms.map(g=>{
    const A=g.A, B=g.B;
    const rA = hexMode ? hexApothem(cur.gridSize) : A.r;
    const rB = hexMode ? hexApothem(cur.gridSize) : B.r;
    const start = circleEdgePoint(A.x, A.y, rA, g.mx, g.my);
    const end = circleEdgePoint(B.x, B.y, rB, g.mx, g.my);
    return {g, e:g.edge, start, end, segLen:Math.hypot(end.x-start.x, end.y-start.y)};
  });
  const hits = ui.managing ? edgeGeoms.map(({e,start,end,segLen,g})=>{
    if(segLen<12){
      const midx=(start.x+end.x)/2, midy=(start.y+end.y)/2;
      return `<circle cx="${midx}" cy="${midy}" r="10" fill="transparent" style="cursor:pointer;" onclick="event.stopPropagation(); startEditMapEdge('${e.id}')"></circle>`;
    }
    return `<path d="M ${start.x} ${start.y} Q ${g.mx} ${g.my} ${end.x} ${end.y}" fill="none" stroke="transparent" stroke-width="16" style="cursor:pointer;" onclick="event.stopPropagation(); startEditMapEdge('${e.id}')"></path>`;
  }).join('') : '';
  const lines = edgeGeoms.map(({g,e,start,end,segLen})=>{
    const dashed = e.type==='secret' ? 'stroke-dasharray="5,5"' : '';
    if(segLen<12){
      const midx=(start.x+end.x)/2, midy=(start.y+end.y)/2;
      const angle = Math.atan2(g.B.y-g.A.y, g.B.x-g.A.x)*180/Math.PI;
      const secretRing = e.type==='secret' ? `<circle cx="${midx}" cy="${midy}" r="7" fill="none" stroke="var(--gold-dim)" stroke-width="1.5" stroke-dasharray="3,2"></circle>` : '';
      const mark = e.oneway
        ? `<g transform="translate(${midx},${midy}) rotate(${angle})"><path d="M -4,-5 L 5,0 L -4,5 z" fill="var(--gold-dim)"></path></g>`
        : `<circle cx="${midx}" cy="${midy}" r="4" fill="var(--gold-dim)"></circle>`;
      return secretRing + mark;
    }
    const marker = e.oneway ? 'marker-end="url(#map-arrow)"' : '';
    return `<path d="M ${start.x} ${start.y} Q ${g.mx} ${g.my} ${end.x} ${end.y}" fill="none" stroke="var(--gold-dim)" stroke-width="2" ${dashed} ${marker}></path>`;
  }).join('');
  return {lines, hits};
}
// Which tile/mark definitions the map needs; `key` changes only when that set
// does (the markup itself can be ~1 MB with imported images, so it's only
// built when needed).
function mapTileDefsNeeded(cur){
  const baseIds = new Set(), markIds = new Set();
  if(cur.grid==='hex') cur.nodes.forEach(n=>{
    const b = tileBaseId(n.terrain, n.settlement);
    if(b) baseIds.add(b);
    if(TERRAIN_BY_ID[n.terrain] && SETTLEMENT_BY_ID[n.settlement]) markIds.add(n.settlement);
  });
  return {baseIds, markIds, key:[...baseIds].sort().join(',')+'|'+[...markIds].sort().join(',')};
}
// Called by render() after the page HTML is in place: puts the (kept or new)
// map SVG into #map-wrap and brings it up to date.
function mountMapSvg(){
  const wrap = document.getElementById('map-wrap');
  if(!wrap) return;
  const cur = getCurrentMap();
  if(!cur) return;
  const hexMode = cur.grid==='hex';
  // Structural changes (other map, grid type/size, tile images) → start over.
  const fresh = !mapDom || mapDom.mapId!==cur.id || mapDom.grid!==cur.grid || mapDom.gridSize!==cur.gridSize || mapDom.images!==TERRAIN_IMAGES;
  if(fresh){
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('onclick', 'onMapCanvasClick(event)');
    svg.innerHTML = `<defs><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--gold-dim)"></path></marker><g id="map-tile-defs"></g></defs>
      <g id="map-grid"></g><g id="map-nodes"></g><g id="map-edges" style="pointer-events:none;"></g><g id="map-edge-hits"></g><g id="map-overlay" style="pointer-events:none;"></g>`;
    mapDom = {svg, mapId:cur.id, grid:cur.grid, gridSize:cur.gridSize, images:TERRAIN_IMAGES, defsKey:null, gridKey:null, layers:{}, nodeEls:new Map(), order:[]};
  }
  const svg = mapDom.svg;
  const layer = id => svg.querySelector('#'+id);

  // Size (fits all rooms) and zoom.
  let W = 320, H = 220;
  cur.nodes.forEach(n=>{ const r = mapNodeRadius(cur, n); if(n.x+r+30>W) W = n.x+r+30; if(n.y+r+30>H) H = n.y+r+30; });
  const topMargin = 30;
  const setAttr = (k, v) => { v = String(v); if(svg.getAttribute(k)!==v) svg.setAttribute(k, v); };
  setAttr('viewBox', `0 ${-topMargin} ${W} ${H+topMargin}`);
  setAttr('width', W); setAttr('height', H+topMargin);
  setAttr('style', zoomSvgStyle('map'));

  const gridKey = `${cur.grid}|${cur.gridSize}|${W}|${H}`;
  if(mapDom.gridKey!==gridKey){ layer('map-grid').innerHTML = gridPatternSvg(cur.grid, W, H, cur.gridSize, 'map'); mapDom.gridKey = gridKey; }

  const need = mapTileDefsNeeded(cur);
  if(mapDom.defsKey!==need.key){ layer('map-tile-defs').innerHTML = tileDefsSvg(need.baseIds, need.markIds); mapDom.defsKey = need.key; }

  // Hex layer: reuse the element of every hex whose markup is unchanged.
  // (Compared by markup, not object identity: saving re-normalizes the
  // campaign, which recreates every node object.)
  const nodesLayer = layer('map-nodes');
  const nextEls = new Map(), order = [];
  cur.nodes.forEach(n=>{
    const markup = mapNodeMarkup(cur, n);
    const prev = mapDom.nodeEls.get(n.id);
    let el;
    if(prev && prev.markup===markup) el = prev.el;
    else {
      el = svgFromMarkup(markup);
      if(prev) prev.el.replaceWith(el);
    }
    nextEls.set(n.id, {markup, el});
    order.push(n.id);
  });
  mapDom.nodeEls.forEach((v, id)=>{ if(!nextEls.has(id)) v.el.remove(); });
  // Keep DOM order = data order without moving existing elements where
  // possible (moving thousands of them forces a full restyle): the usual
  // changes are deletions (already removed above) and additions at the end.
  const kept = mapDom.order.filter(id=>nextEls.has(id));
  const isPrefix = kept.every((id,i)=>order[i]===id);
  const frag = document.createDocumentFragment();
  if(isPrefix){
    order.slice(kept.length).forEach(id=>frag.appendChild(nextEls.get(id).el));
  } else {
    order.forEach(id=>frag.appendChild(nextEls.get(id).el));
  }
  if(frag.childNodes.length) nodesLayer.appendChild(frag);
  mapDom.nodeEls = nextEls; mapDom.order = order;

  // Small layers: only touch the DOM when their markup changed — any change
  // inside the SVG makes the browser lay out the whole (big) drawing again.
  const {lines, hits} = mapEdgesMarkup(cur);
  const setLayer = (id, markup) => { if(mapDom.layers[id]!==markup){ layer(id).innerHTML = markup; mapDom.layers[id] = markup; } };
  setLayer('map-edges', lines);
  setLayer('map-edge-hits', hits);
  setLayer('map-overlay', mapOverlayMarkup(cur));

  // Re-appending an already placed svg would detach it (→ full restyle).
  if(svg.parentNode!==wrap) wrap.replaceChildren(svg);
}
function renderMapTab(){
  const active = getActive();
  const cur = getCurrentMap();
  let html = `<div class="pill-scroll">`;
  html += active.maps.map(m=>`<button class="pill ${cur&&m.id===cur.id?'active':'inactive'}" onclick="setActiveMapId('${m.id}')">${escapeHtml(m.name)}</button>`).join('');
  html += `<button class="icon-btn raised" style="border-radius:999px;" onclick="addMap()">+</button>`;
  html += `</div>`;

  if(!cur){
    html += `<div class="panel empty"><span>Noch keine Karte angelegt.</span>
      <button class="btn btn-raised" onclick="addMap()">+ Erste Karte anlegen</button></div>`;
    return html;
  }

  html += `<div class="panel" style="gap:8px;">
    <input type="text" value="${escapeHtml(cur.name)}" placeholder="Kartenname" oninput="onMapNameInput(this)">
    <textarea rows="2" placeholder="Beschreibung der Karte…" oninput="onMapDescInput(this)">${escapeHtml(cur.description)}</textarea>
  </div>`;

  if(ui.managing){
    const connectLabel = ui.mapConnectFrom==='PENDING' ? '🔗 Ersten Raum tippen…' : (ui.mapConnectFrom ? '🔗 Zweiten Raum tippen…' : '🔗 Verbinden');
    html += `<div class="row wrap" style="gap:8px;">
      <button class="btn btn-gold" style="padding:6px 10px;font-size:12px;" onclick="addMapNode()">+ Raum</button>
      <button class="btn ${ui.mapConnectFrom?'btn-gold':'btn-raised'}" style="padding:6px 10px;font-size:12px;" onclick="toggleMapConnectMode()">${connectLabel}</button>
      <button class="btn btn-outline-wax" style="padding:6px 10px;font-size:12px;margin-left:auto;" onclick="deleteMap('${cur.id}')">🗑 Karte löschen</button>
    </div>
    <div class="row wrap" style="gap:8px;align-items:center;">
      <span class="small-muted">Raster:</span>
      <div class="mode-toggle" style="width:auto;">
        <button style="padding:6px 10px;font-size:12px;${cur.grid==='none'?'background:var(--gold);color:var(--bg);':''}" onclick="setMapGridType('none')">Kein Raster</button>
        <button style="padding:6px 10px;font-size:12px;${cur.grid==='square'?'background:var(--gold);color:var(--bg);':''}" onclick="setMapGridType('square')">Quadrate</button>
        <button style="padding:6px 10px;font-size:12px;${cur.grid==='hex'?'background:var(--gold);color:var(--bg);':''}" onclick="setMapGridType('hex')">Hex</button>
      </div>
      ${cur.grid!=='none' ? `<input type="range" min="24" max="64" value="${cur.gridSize}" oninput="onMapGridSizeInput(this)" style="width:100px;">` : ''}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <span class="small-muted">Pinsel${ui.mapBrush ? ': <b style="color:var(--gold);">'+escapeHtml(brushLabel(ui.mapBrush))+'</b> — leere Stelle tippen = neues Feld, Feld tippen = anwenden'+(ui.mapBrush.startsWith('set:') ? ' (nochmal = entfernen)' : '') : ' (optional) — Gelände oder Siedlung wählen, dann Felder antippen'}</span>
      ${renderTerrainPalette(ui.mapBrush, 'setMapBrush', true)}
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <span class="small-muted">Gebiet-Pinsel (Begegnungstabelle, z.B. New Pictland) — solange ausgefüllt, bekommt jedes angetippte Feld dieses Gebiet. Leeren = aus.</span>
      <div class="row" style="gap:6px;">
        <input type="text" list="area-table-names" value="${escapeHtml(ui.mapAreaBrush||'')}" oninput="onMapAreaBrushInput(this)" onchange="render()" placeholder="Gebiet…" style="flex:1;">
        ${ui.mapAreaBrush ? `<button class="icon-btn raised" title="Gebiet-Pinsel aus" onclick="ui.mapAreaBrush=''; render();">✕</button>` : ''}
      </div>
      ${areaDatalistHtml()}
    </div>
    <p class="small-muted" style="margin:0;">Tippe auf eine leere Stelle in der Karte, um dort einen neuen Raum anzulegen${cur.grid!=='none' ? ' — Räume rasten automatisch am Raster ein' : ''}.</p>`;
    if(ui.mapMoveArmedId){
      html += `<div class="panel" style="background:var(--panel-raised);"><span class="small-muted">Tippe auf die Karte, um den Raum dorthin zu verschieben. <button class="link-chip" onclick="cancelMoveMapNode()">Abbrechen</button></span></div>`;
    }
  }

  html += `<div class="panel" id="map-panel" style="padding:6px;gap:6px;">
    <div class="map-svg-wrap" ${zoomWrapAttrs('map')}></div>
    <div class="row" style="gap:4px;justify-content:flex-end;">${zoomControlsHtml('map','Ganze Karte zeigen')}</div>
  </div>`;

  if(ui.mapEncounterResult){
    html += `<div class="panel" style="border-color:var(--gold-dim);">
      <div class="row between" style="gap:8px;align-items:flex-start;">
        <span class="log-text" style="color:var(--text);">🎲 ${escapeHtml(ui.mapEncounterResult)}</span>
        <button class="icon-btn" onclick="ui.mapEncounterResult=null; render();">✕</button>
      </div>
    </div>`;
  }
  if(cur.nodes.length===0){
    html += `<p class="small-muted">${ui.managing ? 'Noch keine Räume — tippe oben auf „+ Raum".' : 'Noch keine Räume auf dieser Karte.'}</p>`;
  }

  if(!ui.managing && ui.selectedMapNodeId){
    const n = cur.nodes.find(x=>x.id===ui.selectedMapNodeId);
    if(n){
      const connectedEdges = cur.edges.filter(e=>e.from===n.id || e.to===n.id).map(e=>{
        const otherId = e.from===n.id ? e.to : e.from;
        const other = cur.nodes.find(x=>x.id===otherId);
        const dirLabel = e.oneway ? (e.from===n.id ? '→' : '←') : '↔';
        const typeLabel = e.type==='secret' ? '🔒 ' : '';
        return `<div class="row between" style="gap:8px;">
          <span style="font-size:13px;">${typeLabel}${dirLabel} ${escapeHtml(other?(other.num+' · '+other.name):'?')}</span>
          <button class="icon-btn" onclick="deleteMapEdge('${e.id}')">🗑</button>
        </div>`;
      }).join('');
      html += `<div class="panel" style="gap:8px;">
        <div class="row between" style="gap:8px;">
          <span class="small-muted">Raum ${escapeHtml(n.num)}</span>
          <button class="icon-btn" onclick="selectMapNode('${n.id}')">✕</button>
        </div>
        <input type="text" value="${escapeHtml(n.name)}" oninput="onSelectedMapNodeNameInput('${n.id}',this)" onblur="render()" placeholder="Name des Raums" style="font-weight:600;color:var(--gold);">
        <textarea rows="3" placeholder="Beschreibung, Fallen, Inhalt…" oninput="onSelectedMapNodeDescInput('${n.id}',this)" onblur="render()">${escapeHtml(n.desc)}</textarea>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span class="small-muted">Verbindungen</span>
          ${connectedEdges || '<p class="small-muted" style="margin:0;">Keine Verbindungen.</p>'}
        </div>
        ${(n.terrain || n.settlement || n.area) ? `<span class="small-muted">${escapeHtml([terrainContextLabel({terrain:n.terrain, settlement:n.settlement}), n.area ? 'Gebiet: '+n.area : ''].filter(Boolean).join(' · '))}</span>` : ''}
        ${n.area && findTableByName(n.area)
          ? `<button class="btn btn-gold" onclick="travelAndEncounter('${n.id}')">📍 Hierher reisen + 🎲 Begegnung</button>
             <button class="btn btn-raised" onclick="setMarkerHere('${n.id}')">📍 Nur Marker hierher</button>`
          : `${n.area ? `<p class="small-muted" style="margin:0;color:var(--wax);">Keine Tabelle „${escapeHtml(n.area)}“ gefunden.</p>` : ''}
             <button class="btn btn-gold" onclick="setMarkerHere('${n.id}')">📍 Marker hierher</button>`}
      </div>`;
    }
  }
  return html;
}
function setMapNodeDraftTerrain(id){ ui.mapNodeDraft.terrain = id==='__clear' ? null : id; render(); }
function setMapNodeDraftSettlement(id){ ui.mapNodeDraft.settlement = (id==='__clear' || ui.mapNodeDraft.settlement===id) ? null : id; render(); }
// Row of hex swatches; `current` is highlighted, clicking calls handler(id).
// '__clear' = none. withSettlements adds City/Town brushes ('set:city', ...).
function renderTerrainPalette(current, handler, withSettlements){
  const swatch = (id, label, swatchId, on) => `<button title="${escapeHtml(label)}" onclick="${handler}('${id}')"
      style="border-radius:8px;padding:2px;border:2px solid ${on?'var(--gold)':'transparent'};background:${on?'var(--panel-raised)':'transparent'};line-height:0;">
      ${terrainSwatchSvg(swatchId, 34)}</button>`;
  const items = [{id:'__clear', label: withSettlements ? 'Gelände & Siedlung entfernen' : 'Kein Gelände'}, ...TERRAINS];
  let html = items.map(t=>swatch(t.id, t.label, t.id==='__clear' ? null : t.id, (current||'__clear')===t.id)).join('');
  if(withSettlements){
    html += `<span style="width:1px;align-self:stretch;background:var(--border);margin:0 4px;"></span>`
      + SETTLEMENTS.map(s=>swatch('set:'+s.id, s.label+' (auf Gelände setzen)', s.id, current==='set:'+s.id)).join('');
  }
  return `<div class="row wrap" style="gap:4px;">${html}</div>`;
}
function renderSettlementChoice(current){
  const opts = [{id:'__clear', label:'Keine'}, ...SETTLEMENTS];
  return `<div class="row wrap" style="gap:4px;">${opts.map(s=>{
    const on = (current||'__clear')===s.id;
    return `<button onclick="setMapNodeDraftSettlement('${s.id}')" class="row" style="gap:6px;border-radius:8px;padding:2px 8px 2px 2px;border:2px solid ${on?'var(--gold)':'var(--border)'};background:${on?'var(--panel-raised)':'transparent'};color:var(--text);font-size:13px;">
      ${terrainSwatchSvg(s.id==='__clear' ? null : s.id, 28)}${escapeHtml(s.label)}</button>`;
  }).join('')}</div>`;
}
function renderMapNodeModal(){
  const d = ui.mapNodeDraft, id = ui.editingMapNodeId;
  const cur = getCurrentMap();
  const hexMode = cur && cur.grid==='hex';
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">Raum bearbeiten</span>
      <button class="icon-btn" onclick="cancelMapNodeModal()">✕</button></div>
    <div class="row" style="gap:8px;">
      <input type="text" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(d.num)}" oninput="ui.mapNodeDraft.num=this.value;" style="width:72px;" placeholder="Nr.">
      <input type="text" value="${escapeHtml(d.name)}" oninput="ui.mapNodeDraft.name=this.value;" placeholder="Name des Raums" style="flex:1;">
    </div>
    <textarea rows="4" placeholder="Beschreibung, Fallen, Inhalt…" oninput="ui.mapNodeDraft.desc=this.value;">${escapeHtml(d.desc)}</textarea>
    <span class="small-muted">Gelände: ${escapeHtml(d.terrain && TERRAIN_BY_ID[d.terrain] ? TERRAIN_BY_ID[d.terrain].label : 'keins')}</span>
    ${renderTerrainPalette(d.terrain, 'setMapNodeDraftTerrain')}
    <span class="small-muted">Siedlung (liegt auf dem Gelände):</span>
    ${renderSettlementChoice(d.settlement)}
    <span class="small-muted">Gebiet (Begegnungstabelle, z.B. New Pictland):</span>
    <input type="text" list="area-table-names" value="${escapeHtml(d.area||'')}" oninput="ui.mapNodeDraft.area=this.value;" placeholder="Gebiet…">
    ${areaDatalistHtml()}
    ${hexMode ? `<p class="small-muted" style="margin:0;">Im Hex-Raster füllt jeder Raum immer eine ganze Zelle — die Größe folgt dem Raster-Schieberegler in der Kartenansicht.</p>` : `
    <div class="row between">
      <span class="small-muted">Größe</span>
      <span class="small-muted" id="mapNodeRVal">${d.r}</span>
    </div>
    <input type="range" min="10" max="40" value="${d.r}" oninput="ui.mapNodeDraft.r=this.value; document.getElementById('mapNodeRVal').textContent=this.value;">`}
    <div class="row wrap" style="gap:8px;">
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="cancelMapNodeModal(); armMoveMapNode('${id}')">↔ Verschieben</button>
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="cancelMapNodeModal(); setMarkerHere('${id}')">📍 Marker hierher</button>
    </div>
    <div class="row">
      <button class="btn btn-outline-wax" onclick="deleteMapNode('${id}')">🗑 Löschen</button>
      <button class="btn btn-gold" style="flex:1;" onclick="saveMapNode()">✓ Speichern</button>
    </div>
  </div></div>`;
}
function renderMapEdgeModal(){
  const d = ui.mapEdgeDraft;
  const isNew = ui.editingMapEdgeId==='new';
  const cur = getCurrentMap();
  const fromNode = cur && cur.nodes.find(n=>n.id===d.from);
  const toNode = cur && cur.nodes.find(n=>n.id===d.to);
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">${isNew?'Neue Verbindung':'Verbindung bearbeiten'}</span>
      <button class="icon-btn" onclick="cancelMapEdgeModal()">✕</button></div>
    <span class="small-muted">${escapeHtml(fromNode?fromNode.name:'?')} → ${escapeHtml(toNode?toNode.name:'?')}</span>
    <div class="mode-toggle">
      <button style="${d.type==='open'?'background:var(--gold);color:var(--bg);':''}" onclick="setMapEdgeDraftType('open')">Offen</button>
      <button style="${d.type==='secret'?'background:var(--gold);color:var(--bg);':''}" onclick="setMapEdgeDraftType('secret')">Geheim</button>
    </div>
    <button class="row between" style="border-radius:10px;padding:10px 12px;background:${d.oneway?'var(--panel-raised)':'transparent'};border:1px solid ${d.oneway?'var(--gold)':'var(--border)'};color:var(--text);" onclick="toggleMapEdgeDraftOneway()">
      <span>Einbahn (nur ${escapeHtml(fromNode?fromNode.name:'?')} → ${escapeHtml(toNode?toNode.name:'?')})</span>${d.oneway?'<span style="color:var(--gold);">✓</span>':''}
    </button>
    <div class="row">
      ${!isNew ? `<button class="btn btn-outline-wax" onclick="deleteMapEdge('${ui.editingMapEdgeId}')">🗑 Löschen</button>` : ''}
      <button class="btn btn-gold" style="flex:1;" onclick="saveMapEdge()">✓ Speichern</button>
    </div>
  </div></div>`;
}
