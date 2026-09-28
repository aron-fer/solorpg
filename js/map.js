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
  const node = {id:uid(), name: def ? def.label : 'Raum '+(idx+1), num: String(idx+1), x:snapped.x, y:snapped.y, r:16, desc:'',
    terrain: t ? brush : null, settlement: s ? s.id : null};
  updateCurrentMap(m=>({...m, nodes:[...m.nodes, node]}));
  saveState(); render();
}
function setMapGridType(type){
  updateCurrentMap(m=>({...m, grid:type}));
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
function paintMapNode(id, brush){
  updateCurrentMap(m=>({...m, nodes: m.nodes.map(n=>{
    if(n.id!==id) return n;
    if(brush==='__clear') return {...n, terrain:null, settlement:null};
    if(brush.startsWith('set:')){
      const s = brush.slice(4);
      return {...n, settlement: n.settlement===s ? null : s};
    }
    return {...n, terrain: brush};
  })}));
  saveState(); render();
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
    if(ui.mapBrush){ paintMapNode(id, ui.mapBrush); return; }
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
  ui.mapNodeDraft = {name:n.name, num:n.num, desc:n.desc, r:n.r, terrain:n.terrain||null, settlement:n.settlement||null};
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
    <p class="small-muted" style="margin:0;">Tippe auf eine leere Stelle in der Karte, um dort einen neuen Raum anzulegen${cur.grid!=='none' ? ' — Räume rasten automatisch am Raster ein' : ''}.</p>`;
    if(ui.mapMoveArmedId){
      html += `<div class="panel" style="background:var(--panel-raised);"><span class="small-muted">Tippe auf die Karte, um den Raum dorthin zu verschieben. <button class="link-chip" onclick="cancelMoveMapNode()">Abbrechen</button></span></div>`;
    }
  }

  const hexMode = cur.grid==='hex';
  // In hex mode every room is a fixed-size hex that exactly fills one grid
  // cell (no per-room resizing there — that's the trade-off for rooms that
  // always tile cleanly with the grid).
  const nodeR = n => hexMode ? cur.gridSize : n.r;
  const W = Math.max(320, 320, ...cur.nodes.map(n=>n.x+nodeR(n)+30));
  const H = Math.max(220, 220, ...cur.nodes.map(n=>n.y+nodeR(n)+30));
  const gridSvg = hexMode ? renderHexGridLines(W, H, cur.gridSize)
    : cur.grid==='square' ? renderSquareGridLines(W, H, cur.gridSize) : '';
  const geoms = curvedEdgeGeometry(cur.nodes, cur.edges, 18);
  // Split into an (invisible, clickable) hit-test layer that stays BELOW the
  // nodes — so tapping a node always wins over tapping a nearby edge — and
  // the actual visible line, drawn AFTER the nodes so hex-filled rooms that
  // sit right next to each other don't swallow the connector between them.
  // Precompute each edge's clipped endpoints once, since touching hex cells
  // (the normal case for hex-neighbor rooms) leave zero line length between
  // them — both the hit-test layer and the visible layer need to fall back
  // to a small doorway marker at the shared wall in that case.
  const edgeGeoms = geoms.map(g=>{
    const A=g.A, B=g.B, e=g.edge;
    const rA = hexMode ? hexApothem(cur.gridSize) : A.r;
    const rB = hexMode ? hexApothem(cur.gridSize) : B.r;
    const start = circleEdgePoint(A.x, A.y, rA, g.mx, g.my);
    const end = circleEdgePoint(B.x, B.y, rB, g.mx, g.my);
    const segLen = Math.hypot(end.x-start.x, end.y-start.y);
    return {g, e, start, end, segLen};
  });
  const edgeHitSvg = ui.managing ? edgeGeoms.map(({e,start,end,segLen,g})=>{
    if(segLen<12){
      const midx=(start.x+end.x)/2, midy=(start.y+end.y)/2;
      return `<circle cx="${midx}" cy="${midy}" r="10" fill="transparent" style="cursor:pointer;" onclick="event.stopPropagation(); startEditMapEdge('${e.id}')"></circle>`;
    }
    const d = `M ${start.x} ${start.y} Q ${g.mx} ${g.my} ${end.x} ${end.y}`;
    return `<path d="${d}" fill="none" stroke="transparent" stroke-width="16" style="cursor:pointer;" onclick="event.stopPropagation(); startEditMapEdge('${e.id}')"></path>`;
  }).join('') : '';
  const edgesSvg = edgeGeoms.map(({g,e,start,end,segLen})=>{
    const dashed = e.type==='secret' ? 'stroke-dasharray="5,5"' : '';
    if(segLen<12){
      // Adjacent hex rooms already share a wall — mark the connection right
      // on that shared edge instead of drawing a (now zero-length) line.
      const midx=(start.x+end.x)/2, midy=(start.y+end.y)/2;
      const angle = Math.atan2(g.B.y-g.A.y, g.B.x-g.A.x)*180/Math.PI;
      const secretRing = e.type==='secret' ? `<circle cx="${midx}" cy="${midy}" r="7" fill="none" stroke="var(--gold-dim)" stroke-width="1.5" stroke-dasharray="3,2"></circle>` : '';
      const mark = e.oneway
        ? `<g transform="translate(${midx},${midy}) rotate(${angle})"><path d="M -4,-5 L 5,0 L -4,5 z" fill="var(--gold-dim)"></path></g>`
        : `<circle cx="${midx}" cy="${midy}" r="4" fill="var(--gold-dim)"></circle>`;
      return `<g style="pointer-events:none;">${secretRing}${mark}</g>`;
    }
    const d = `M ${start.x} ${start.y} Q ${g.mx} ${g.my} ${end.x} ${end.y}`;
    const marker = e.oneway ? 'marker-end="url(#map-arrow)"' : '';
    return `<path d="${d}" fill="none" stroke="var(--gold-dim)" stroke-width="2" ${dashed} ${marker} style="pointer-events:none;"></path>`;
  }).join('');
  const nodesSvg = cur.nodes.map(n=>{
    const isMarker = cur.markerNodeId===n.id;
    const isSelected = ui.selectedMapNodeId===n.id;
    const isMoveArmed = ui.mapMoveArmedId===n.id;
    const r = nodeR(n);
    // Terrain/settlement tiles keep their look; selection/move then shows as
    // a thick outline. Plain rooms keep the old filled style.
    const tileFill = terrainFill(n.terrain) || terrainFill(n.settlement);
    const tileStroke = isMoveArmed ? 'var(--wax)' : (isSelected ? 'var(--gold)' : TERRAIN_INK);
    const tile = mapTileSvg(n.terrain, n.settlement, n.x, n.y, r, hexMode, tileStroke, isSelected||isMoveArmed ? 4 : 1);
    const fill = isSelected?'var(--gold-dim)':'var(--panel-raised)';
    const stroke = isMoveArmed?'var(--wax)':'var(--border)';
    const shape = tile || (hexMode
      ? `<polygon points="${hexCornersPoints(n.x,n.y,r)}" fill="${fill}" stroke="${stroke}" stroke-width="2"></polygon>`
      : `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"></circle>`);
    // On a tile the number moves to the lower edge with a halo, so the
    // symbol stays visible.
    const numText = tile
      ? `<text x="${n.x}" y="${n.y + (hexMode ? r*0.8 : r*0.8)}" text-anchor="middle" font-size="${hexMode ? Math.max(8, r*0.28).toFixed(1) : 9}" font-weight="700" fill="${TERRAIN_INK}" stroke="${tileFill}" stroke-width="3" paint-order="stroke" style="pointer-events:none;">${escapeHtml(n.num)}</text>`
      : `<text x="${n.x}" y="${n.y+4}" text-anchor="middle" font-size="12" fill="var(--text)">${escapeHtml(n.num)}</text>`;
    // Player-position marker: a small flag/pin above the room instead of a
    // ring around it, so it doesn't compete visually with the room's own
    // selection highlight and reads the same for circular and hex rooms.
    let pinMarker = '';
    if(isMarker){
      const topR = hexMode ? hexApothem(cur.gridSize) : r;
      const bulbR = 6.5, tailLen = 9, gap = 3;
      const tipY = n.y - topR - gap;
      const bulbCy = tipY - tailLen;
      pinMarker = `<g style="pointer-events:none;">
        <polygon points="${n.x-3.2},${(bulbCy+bulbR-1).toFixed(1)} ${n.x+3.2},${(bulbCy+bulbR-1).toFixed(1)} ${n.x},${tipY}" fill="var(--gold)"></polygon>
        <circle cx="${n.x}" cy="${bulbCy}" r="${bulbR}" fill="var(--gold)" stroke="var(--bg)" stroke-width="1.4"></circle>
        <circle cx="${n.x}" cy="${bulbCy}" r="2.6" fill="var(--bg)"></circle>
      </g>`;
    }
    return `<g onclick="event.stopPropagation(); selectMapNode('${n.id}')" style="cursor:pointer;">
      ${shape}
      ${numText}
      ${pinMarker}
    </g>`;
  }).join('');

  const topMargin = 30;
  html += `<div class="panel" style="padding:6px;">
    <div class="map-svg-wrap">
      <svg viewBox="0 ${-topMargin} ${W} ${H+topMargin}" width="${W}" height="${H+topMargin}" onclick="onMapCanvasClick(event)">
        <defs>
          <marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--gold-dim)"></path>
          </marker>
        </defs>
        ${gridSvg}
        ${nodesSvg}
        ${edgesSvg}
        ${edgeHitSvg}
      </svg>
    </div>
  </div>`;

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
        <button class="btn btn-gold" onclick="setMarkerHere('${n.id}')">📍 Marker hierher</button>
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
