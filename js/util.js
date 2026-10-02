// Tab constants, generic helpers, SVG/graph + grid math, JSON import parsing.
const SPECIAL_TABS = {
  notes: {defaultLabel:'Text', defaultIcon:'📜'},
  dice: {defaultLabel:'Orakel', defaultIcon:'🎲'},
  character: {defaultLabel:'Charakter', defaultIcon:'🧙'},
  map: {defaultLabel:'Karte', defaultIcon:'🗺️'},
  relations: {defaultLabel:'Beziehungen', defaultIcon:'🕸️'},
  battle: {defaultLabel:'Kampf', defaultIcon:'⚔️'},
};
function getAllTabs(){
  const active = getActive();
  const karteiMap = {};
  active.karteien.forEach(k=>karteiMap[k.id]=k);
  return active.tabOrder.map(id=>{
    if(SPECIAL_TABS[id]){
      const ov = (active.tabOverrides||{})[id] || {};
      const label = ov.label && ov.label.trim() ? ov.label : SPECIAL_TABS[id].defaultLabel;
      const icon = ov.icon && ov.icon.trim() ? ov.icon : SPECIAL_TABS[id].defaultIcon;
      return {id, label, icon, special:true};
    }
    const k = karteiMap[id];
    if(k) return {id, label:k.name, icon:k.icon||'📇', special:false};
    return null;
  }).filter(Boolean);
}

const FIELD_TYPES = [
  {id:'number', label:'Zahl (fest)'},
  {id:'counter', label:'Zahl (+/-)'},
  {id:'text', label:'Freitext'},
  {id:'list', label:'Liste'},
  {id:'status', label:'Status (6 Kästchen)'},
  {id:'table', label:'Tabelle (Spalten)'},
  {id:'spells', label:'Spell slots (Vancian)'},
];

const STORAGE_KEY = 'solorpg-data';
const LEGACY_STORAGE_KEY = 'losbuch-data';

function uid(){ return Math.random().toString(36).slice(2,10); }
function rollDie(sides){ return Math.floor(Math.random()*sides)+1; }
function parseFormula(raw){
  const m = raw.trim().match(/^(\d*)[dw](\d+)\s*([+-]\s*\d+)?$/i);
  if(!m) return null;
  const count = m[1] ? parseInt(m[1],10) : 1;
  const sides = parseInt(m[2],10);
  const mod = m[3] ? parseInt(m[3].replace(/\s/g,''),10) : 0;
  if(count<1||count>100||sides<2) return null;
  return {count,sides,mod};
}
function timeNow(){
  const d = new Date();
  return d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
}
function defaultValueForType(type){
  if(type==='list') return [];
  if(type==='text') return '';
  if(type==='status') return [false,false,false,false,false,false];
  if(type==='table') return {columns:['Spalte 1','Spalte 2'], rows:[]};
  if(type==='spells') return {levels:[{slots:1, prepared:[]}]};
  return '0';
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// A string as a JS literal, safe inside a double-quoted inline handler:
// onclick="fn(${jsStr(name)})". Handles quotes, apostrophes and backslashes.
function jsStr(s){ return escapeHtml(JSON.stringify(String(s==null?'':s))); }
// --- Shared graph/SVG helpers (used by Karte and Beziehungen) ---
function pairKey(a,b){ return [a,b].sort().join('|'); }
function labelBoxWidth(text){ return Math.max(30, String(text).length*5.6+12); }
function nodeBoxWidth(text){ return Math.max(60, String(text).length*6.2+16); }
// Ray from node center toward (tx,ty), clipped to the node's rectangle boundary.
function rectEdgePoint(cx, cy, halfw, halfh, tx, ty){
  const dx = tx-cx, dy = ty-cy;
  if(dx===0 && dy===0) return {x:cx, y:cy};
  const sx = dx!==0 ? halfw/Math.abs(dx) : Infinity;
  const sy = dy!==0 ? halfh/Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return {x:cx+dx*s, y:cy+dy*s};
}
// For a pair of nodes with >1 edge between them, curve bend must use the SAME
// sign for both directions of travel (the perpendicular flips automatically
// when source/target reverse) — using opposite signs makes them overlap.
function curveBend(fromId, toId, pairCount, magnitude){
  return pairCount>1 ? magnitude : 0;
}
// Pushes apart any two label boxes (by center + size) that overlap, so labels
// from unrelated edges never sit on top of each other. Mutates geoms in place.
function resolveLabelOverlaps(geoms, iterations){
  for(let it=0; it<(iterations||8); it++){
    let moved = false;
    for(let i=0;i<geoms.length;i++){
      for(let j=i+1;j<geoms.length;j++){
        const A=geoms[i], B=geoms[j];
        const ax1=A.cx-A.w/2, ax2=A.cx+A.w/2, ay1=A.cy-A.h/2, ay2=A.cy+A.h/2;
        const bx1=B.cx-B.w/2, bx2=B.cx+B.w/2, by1=B.cy-B.h/2, by2=B.cy+B.h/2;
        const overlapX = Math.min(ax2,bx2) - Math.max(ax1,bx1);
        const overlapY = Math.min(ay2,by2) - Math.max(ay1,by1);
        if(overlapX>0 && overlapY>0){
          moved = true;
          const dx = B.cx-A.cx, dy = B.cy-A.cy;
          const dist = Math.hypot(dx,dy) || 0.01;
          const push = Math.min(overlapX, overlapY)/2 + 3;
          const ux = dx/dist, uy = dy/dist;
          A.cx -= ux*push; A.cy -= uy*push;
          B.cx += ux*push; B.cy += uy*push;
        }
      }
    }
    if(!moved) break;
  }
}
// Given a set of {id,x,y} nodes and {from,to} edges, computes a quadratic-
// bezier control point per edge. When two nodes share more than one edge
// (bidirectional relationships, a two-way map connection drawn as two one-
// way ones, etc.) the perpendicular axis is taken from a CANONICAL (sorted)
// node-id pair rather than each edge's own from->to direction — otherwise
// the offset's sign flips when direction reverses and both edges land back
// on top of each other. Edges to/from a missing node are dropped.
function curvedEdgeGeometry(nodes, edges, magnitude){
  const byId = {}; nodes.forEach(n=>byId[n.id]=n);
  const pairCounts = {};
  edges.forEach(e=>{ const k=pairKey(e.from,e.to); pairCounts[k]=(pairCounts[k]||0)+1; });
  return edges.map(e=>{
    const A=byId[e.from], B=byId[e.to];
    if(!A||!B) return null;
    const canon = [e.from,e.to].slice().sort();
    const C1=byId[canon[0]], C2=byId[canon[1]];
    const cdx=C2.x-C1.x, cdy=C2.y-C1.y;
    const clen=Math.hypot(cdx,cdy)||1;
    const perpx=-cdy/clen, perpy=cdx/clen;
    const sign = e.from===canon[0] ? 1 : -1;
    const pc = pairCounts[pairKey(e.from,e.to)];
    const bend = pc>1 ? sign*magnitude : 0;
    const mx=(A.x+B.x)/2+perpx*bend, my=(A.y+B.y)/2+perpy*bend;
    return {edge:e, A, B, mx, my};
  }).filter(Boolean);
}
// Ray from a circular node's center toward (tx,ty), clipped to its radius —
// used for the map's round room nodes (Beziehungen uses rectEdgePoint instead).
function circleEdgePoint(cx, cy, r, tx, ty){
  const dx=tx-cx, dy=ty-cy;
  const d=Math.hypot(dx,dy)||1;
  return {x:cx+dx/d*r, y:cy+dy/d*r};
}
// ---- Dungeon-map grid background (square or pointy-top hex) + snapping ----
// Square grid: rooms sit in the middle of a cell, not on a line crossing.
function squareGridSnap(x, y, s){ return {x:Math.floor(x/s)*s + s/2, y:Math.floor(y/s)*s + s/2}; }
// Pointy-top hex grid, using axial coordinates (q,r) — see redblobgames.com/grids/hexagons
// for the reference math. "s" is the hex's circumradius (center to a corner).
function hexAxialToPixel(q, r, s){
  return {x: s*(Math.sqrt(3)*q + Math.sqrt(3)/2*r), y: s*(1.5*r)};
}
function hexPixelToAxial(x, y, s){
  return {q: (Math.sqrt(3)/3*x - 1/3*y)/s, r: (2/3*y)/s};
}
function hexRound(q, r){
  let x=q, z=r, y=-x-z;
  let rx=Math.round(x), ry=Math.round(y), rz=Math.round(z);
  const xDiff=Math.abs(rx-x), yDiff=Math.abs(ry-y), zDiff=Math.abs(rz-z);
  if(xDiff>yDiff && xDiff>zDiff) rx=-ry-rz;
  else if(yDiff>zDiff) ry=-rx-rz;
  else rz=-rx-ry;
  return {q:rx, r:rz};
}
function hexGridSnap(x, y, s){
  const {q,r} = hexPixelToAxial(x, y, s);
  const rounded = hexRound(q, r);
  const px = hexAxialToPixel(rounded.q, rounded.r, s);
  return {x:Math.round(px.x), y:Math.round(px.y)};
}
function hexCornersPoints(cx, cy, s){
  const pts = [];
  for(let i=0;i<6;i++){
    const angle = Math.PI/180*(60*i-30);
    pts.push(`${(cx+s*Math.cos(angle)).toFixed(1)},${(cy+s*Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}
// The inradius (center-to-edge-midpoint) of a hex with circumradius s — used
// to clip lines to a hex node without overshooting past its flat sides.
function hexApothem(s){ return s*Math.sqrt(3)/2; }
function snapToMapGrid(map, x, y){
  if(!map || map.grid==='none') return {x:Math.round(x), y:Math.round(y)};
  const s = map.gridSize||40;
  return map.grid==='hex' ? hexGridSnap(x,y,s) : squareGridSnap(x,y,s);
}
function renderStatusControl(boxes, onToggle, onReduce, onClear, reduceInputId){
  const tier = (()=>{ for(let i=5;i>=0;i--){ if(boxes[i]) return i+1; } return 0; })();
  return `<div style="display:flex;flex-direction:column;gap:8px;">
    <div class="row" style="gap:6px;">
      ${boxes.map((marked,idx)=>`<button class="counter-btn" style="${marked?'background:var(--gold);color:var(--bg);border-color:var(--gold);':''}width:32px;height:32px;font-size:13px;" onclick="${onToggle(idx)}">${idx+1}</button>`).join('')}
      <span class="small-muted" style="margin-left:6px;">Tier ${tier}</span>
    </div>
    <div class="row" style="gap:6px;">
      <input type="number" min="1" max="6" placeholder="Um" id="${reduceInputId}" style="width:64px;">
      <button class="btn btn-raised" style="padding:6px 10px;font-size:12px;" onclick="${onReduce(reduceInputId)}">− Reduzieren</button>
      <button class="icon-btn raised" title="Zurücksetzen" onclick="${onClear()}">↺</button>
    </div>
  </div>`;
}
// Old text-based entry syntax ("Text >> Tabelle"), kept only to migrate
// pre-existing tables into the new structured entry format.
function legacyParseChainSyntax(text){
  const lines = text.split('\n');
  const displayLines = [];
  let linkNames = [];
  lines.forEach(line=>{
    const idx = line.indexOf('>>');
    if(idx===-1){ displayLines.push(line); return; }
    const before = line.slice(0,idx).replace(/\s+$/,'');
    const after = line.slice(idx+2).trim();
    if(before) displayLines.push(before);
    if(after) linkNames = linkNames.concat(after.split(',').map(s=>s.trim()).filter(Boolean));
  });
  return {display: displayLines.join('\n').trim(), linkNames};
}
function migrateTableEntries(rawEntries){
  return (rawEntries||[]).map(e=>{
    if(typeof e === 'string'){
      const {display, linkNames} = legacyParseChainSyntax(e);
      return {id:uid(), text:display, range:null, links:linkNames};
    }
    return Object.assign({id:uid(), text:'', range:null, links:[]}, e);
  });
}
function computeDiceRange(formula){
  const parsed = parseFormula(formula);
  if(!parsed) return null;
  return {min: parsed.count + parsed.mod, max: parsed.count*parsed.sides + parsed.mod};
}
function checkCoverage(entries, formula){
  const range = computeDiceRange(formula);
  if(!range) return null;
  const span = range.max - range.min + 1;
  if(span <= 0 || span > 300) return null;
  const counts = new Array(span).fill(0);
  entries.forEach(e=>{
    if(!e.range) return;
    const lo = Math.max(e.range.min, range.min);
    const hi = Math.min(e.range.max, range.max);
    for(let v=lo; v<=hi; v++) counts[v-range.min]++;
  });
  const gaps = [], dupes = [];
  counts.forEach((c,i)=>{ const val=range.min+i; if(c===0) gaps.push(val); if(c>1) dupes.push(val); });
  return {range, gaps, dupes};
}
function normalizeImportedEntry(e){
  if(typeof e === 'string') return {id:uid(), text:e, range:null, links:[]};
  return {
    id: uid(),
    text: e.text!=null ? (Array.isArray(e.text) ? e.text.join('\n') : String(e.text)) : '',
    range: e.range ? {min:Number(e.range.min), max:Number(e.range.max)} : null,
    links: Array.isArray(e.links) ? e.links.map(String) : [],
  };
}
// Embedded sub-tables of a table (see findLocalSubtable in oracle.js).
function normalizeSubtables(list, normEntry){
  return (Array.isArray(list) ? list : []).filter(st=>st && st.name).map(st=>({
    name: String(st.name), distMode: st.distMode==='dist' ? 'dist' : 'equal', formula: st.formula || '',
    entries: normEntry(st.entries || []),
  }));
}
function parseJSONImport(raw){
  let data;
  try{ data = JSON.parse(raw); }catch(e){ return {error: 'Ungültiges JSON: '+e.message}; }
  const arr = Array.isArray(data) ? data : [data];
  const tables = [];
  const karteien = [];
  const characters = [];
  arr.forEach(t=>{
    const looksLikeKartei = !t.mode && Array.isArray(t.entries) && t.entries.some(e=>e && typeof e==='object' && 'title' in e);
    const looksLikeCharacter = !t.mode && !t.entries && Array.isArray(t.sections);
    if(looksLikeKartei){
      karteien.push({
        name: t.name || 'Unbenannt',
        icon: (t.icon||'').trim() || '📇',
        hasCheckbox: !!t.hasCheckbox,
        // Keep the file's own id/parentId so nesting survives the import;
        // they're remapped to fresh ids in runImport.
        entries: t.entries.map((e,idx)=>({
          fileId: e.id!=null ? String(e.id) : '__idx'+idx,
          parentFileId: e.parentId!=null ? String(e.parentId) : null,
          title: e.title || '', notes: e.notes || '', resolved: !!e.resolved,
        })),
      });
      return;
    }
    if(looksLikeCharacter){
      characters.push({
        name: t.name || 'Unbenannt',
        sections: t.sections.map(s=>({
          name: s.name || 'Bereich',
          fields: (s.fields||[]).map(f=>{
            const type = ['number','counter','text','list','status','table','spells'].includes(f.type) ? f.type : 'text';
            let value = f.value;
            if(type==='status'){
              value = Array.isArray(value) && value.length===6 ? value : [false,false,false,false,false,false];
            } else if(type==='table'){
              value = (value && Array.isArray(value.columns) && Array.isArray(value.rows)) ? value : {columns:['Spalte 1'], rows:[]};
            } else if(type==='list'){
              value = Array.isArray(value) ? value : [];
            } else if(type==='spells'){
              value = (value && Array.isArray(value.levels)) ? value : defaultValueForType('spells');
            } else if(type==='text'){
              value = value!=null ? String(value) : '';
            } else {
              value = value!=null ? String(value) : '0';
            }
            return {name: f.name || 'Feld', type, value};
          }),
        })),
      });
      return;
    }
    const mode = t.mode==='aspects' ? 'aspects' : 'list';
    if(mode==='aspects'){
      const aspects = (t.aspects||[]).map(a=>({
        id: uid(), name: a.name || 'Aspekt',
        distMode: a.distMode==='dist' ? 'dist' : 'equal',
        formula: a.formula || '',
        options: (a.options||[]).map(normalizeImportedEntry),
      }));
      tables.push({name: t.name || 'Unbenannt', group: t.group || '', mode, aspects, entries:[], distMode:'equal', formula:'',
        subtables: normalizeSubtables(t.subtables, es=>es.map(normalizeImportedEntry))});
      return;
    }
    tables.push({
      name: t.name || 'Unbenannt', group: t.group || '', mode,
      distMode: t.distMode==='dist' ? 'dist' : 'equal',
      formula: t.formula || '',
      entries: (t.entries||[]).map(normalizeImportedEntry),
      aspects: [],
      subtables: normalizeSubtables(t.subtables, es=>es.map(normalizeImportedEntry)),
    });
  });
  return {tables, karteien, characters};
}

// ---- Zoomable SVG views (Karte, Beziehungen) ----
// A view is a scroll container with id `${key}-wrap` holding one <svg>.
// Zoom 1 = drawing fitted to the panel width; zooming widens the drawing and
// the container scrolls natively (one finger / scrollbar). Pinch (touch),
// Ctrl+wheel / trackpad pinch (desktop) and −/100%/+ buttons change it.
// Zoom and scroll position survive re-renders (see restoreZoomViews).
const ZOOM_MIN = 0.2; // below 1 the drawing gets narrower than the panel (centred)
const zoomViews = {};
function zoomView(key, maxZoom){
  if(!zoomViews[key]) zoomViews[key] = {z:1, x:0, y:0, max:maxZoom||4};
  if(maxZoom) zoomViews[key].max = maxZoom;
  return zoomViews[key];
}
function resetZoomScroll(key){ const v = zoomView(key); v.x = 0; v.y = 0; }
function applyZoom(key, z, anchorX, anchorY){
  const wrap = document.getElementById(key+'-wrap');
  if(!wrap) return;
  const v = zoomView(key);
  const svg = wrap.querySelector('svg');
  // Can always zoom out far enough to see the whole drawing (tall maps need < 20%).
  z = Math.max(Math.min(ZOOM_MIN, fitZoom(key)), Math.min(v.max, z));
  const rect = wrap.getBoundingClientRect();
  const ax = anchorX==null ? rect.width/2 : anchorX-rect.left;
  const ay = anchorY==null ? rect.height/2 : anchorY-rect.top;
  const old = svg.getBoundingClientRect();
  const fx = (wrap.scrollLeft+ax)/(old.width||1), fy = (wrap.scrollTop+ay)/(old.height||1);
  svg.style.width = (z*100)+'%';
  const now = svg.getBoundingClientRect();
  wrap.scrollLeft = fx*now.width - ax;
  wrap.scrollTop = fy*now.height - ay;
  v.z = z; v.x = wrap.scrollLeft; v.y = wrap.scrollTop;
  const lbl = document.getElementById(key+'-zoom-label');
  if(lbl) lbl.textContent = Math.round(z*100)+'%';
}
function zoomBy(key, f){ applyZoom(key, zoomView(key).z*f); }
// Zoom that shows the whole drawing (fits width AND height of the panel).
function fitZoom(key){
  const wrap = document.getElementById(key+'-wrap');
  const svg = wrap && wrap.querySelector('svg');
  if(!svg) return 1;
  const vb = svg.viewBox.baseVal;
  if(!vb || !vb.width) return 1;
  const cw = wrap.clientWidth, ch = wrap.clientHeight;
  // A hair smaller than exact, so rounding doesn't leave a pointless scrollbar.
  return Math.max(0.05, Math.min(1, ch / (cw * vb.height / vb.width) * 0.99));
}
function onZoomWheel(e, key){
  if(!e.ctrlKey) return; // plain wheel scrolls as usual
  e.preventDefault();
  applyZoom(key, zoomView(key).z*Math.exp(-e.deltaY*0.003), e.clientX, e.clientY);
}
let zoomPinch = null;
function onZoomTouchStart(e, key){
  if(e.touches.length===2){
    const [a,b] = e.touches;
    zoomPinch = {key, dist:Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY)||1, zoom:zoomView(key).z};
    if(typeof relationEdgePointerUp==='function') relationEdgePointerUp(); // a pinch is not a long-press
  }
}
function onZoomTouchMove(e, key){
  if(!zoomPinch || zoomPinch.key!==key || e.touches.length!==2) return;
  e.preventDefault();
  const [a,b] = e.touches;
  const dist = Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
  applyZoom(key, zoomPinch.zoom*dist/zoomPinch.dist, (a.clientX+b.clientX)/2, (a.clientY+b.clientY)/2);
}
function onZoomTouchEnd(e){ if(e.touches.length<2) zoomPinch = null; }
function onZoomScroll(el, key){ const v = zoomView(key); v.x = el.scrollLeft; v.y = el.scrollTop; }
// Attributes for the scroll container, and the −/100%/+ buttons.
// `aspect` (width / height of the drawing) fixes the container's shape, so
// zooming in doesn't make the panel grow (it would otherwise expand from the
// fitted drawing's height up to its max-height).
function zoomWrapAttrs(key, aspect){
  return `id="${key}-wrap" style="${aspect ? `aspect-ratio:${aspect};` : ''}" onscroll="onZoomScroll(this,'${key}')" onwheel="onZoomWheel(event,'${key}')"
    ontouchstart="onZoomTouchStart(event,'${key}')" ontouchmove="onZoomTouchMove(event,'${key}')" ontouchend="onZoomTouchEnd(event)" ontouchcancel="onZoomTouchEnd(event)"`;
}
function zoomSvgStyle(key){ return `width:${zoomView(key).z*100}%;max-width:none;height:auto;margin:0 auto;`; }
function zoomControlsHtml(key, fitTitle){
  return `<button class="icon-btn raised" title="Verkleinern" onclick="zoomBy('${key}',1/1.4)">−</button>
    <button class="icon-btn raised" title="${fitTitle||'Alles zeigen'}" onclick="applyZoom('${key}',fitZoom('${key}'))"><span id="${key}-zoom-label" style="font-size:11px;font-family:ui-monospace,monospace;">${Math.round(zoomView(key).z*100)}%</span></button>
    <button class="icon-btn raised" title="Vergrößern" onclick="zoomBy('${key}',1.4)">+</button>`;
}
// render() replaces the DOM; put every zoomed view back where it was.
function restoreZoomViews(){
  Object.entries(zoomViews).forEach(([key, v])=>{
    const wrap = document.getElementById(key+'-wrap');
    if(wrap){ wrap.scrollLeft = v.x; wrap.scrollTop = v.y; }
  });
}

// Grid background as a single rect filled with a repeating <pattern> —
// constant size no matter how big the map (instead of one element per cell).
// Aligned to the same lattice as snapToMapGrid (origin 0,0).
function gridPatternSvg(grid, W, H, s, idPrefix){
  const id = (idPrefix||'grid')+'-pat';
  let tile;
  if(grid==='hex'){
    const w = Math.sqrt(3)*s;
    const hexes = [[0,0],[w,0],[w/2,1.5*s],[0,3*s],[w,3*s]].map(([cx,cy])=>
      `<polygon points="${hexCornersPoints(cx,cy,s)}" fill="none" stroke="var(--border)" stroke-width="1"></polygon>`).join('');
    tile = `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="0" width="${w.toFixed(3)}" height="${3*s}">${hexes}</pattern>`;
  } else if(grid==='square'){
    tile = `<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="0" width="${s}" height="${s}"><path d="M ${s} 0 L 0 0 0 ${s}" fill="none" stroke="var(--border)" stroke-width="1"></path></pattern>`;
  } else return '';
  return `<defs>${tile}</defs><rect x="0" y="0" width="${W}" height="${H}" fill="url(#${id})" style="pointer-events:none;"></rect>`;
}
