// Terrain tiles for hex maps (Karte tab). Original SVG drawings in a
// parchment-and-ink style, one per terrain type of the Hyperborea atlas key.
// Each symbol is drawn in a 40-unit space (hex circumradius 40, centre 0,0)
// and scaled to the actual hex size.
const TERRAIN_INK = '#3b2a1c';
const TERRAIN_WATER = '#3f86a8';
const TERRAIN_SNOW = '#f7f5f0';

// Small drawing helpers (all return SVG markup in the 40-unit space).
const tInk = (d, w) => `<path d="${d}" fill="none" stroke="${TERRAIN_INK}" stroke-width="${w||1.6}" stroke-linecap="round" stroke-linejoin="round"></path>`;
const tFill = (d, fill, w) => `<path d="${d}" fill="${fill}" stroke="${TERRAIN_INK}" stroke-width="${w||1.6}" stroke-linejoin="round"></path>`;
function tPeak(x, y, h, w, snow){
  // A mountain peak: filled triangle, shaded right flank, optional snow cap.
  const l = `${x-w},${y}`, t = `${x},${y-h}`, r = `${x+w},${y}`;
  let s = tFill(`M${l} L${t} L${r} Z`, snow ? TERRAIN_SNOW : '#b98f64');
  s += tInk(`M${x},${y-h} L${x+w*0.25},${y-h*0.45} L${x+w*0.1},${y}`, 1.1);
  for(let i=1;i<=3;i++) s += tInk(`M${x+w*0.3+i*w*0.14},${y-h*0.1-i*h*0.12} l${w*0.12},${h*0.16}`, 0.9);
  return s;
}
function tHill(x, y, w, snow){
  // Rounded mound: solid body (no outline along the base), inked crest, and
  // short shading strokes on the right flank.
  const h = w*0.9;
  let s = `<path d="M${x-w},${y} C${x-w*0.7},${y-h} ${x+w*0.7},${y-h} ${x+w},${y} Z" fill="${snow ? TERRAIN_SNOW : '#c99a68'}"></path>`;
  s += tInk(`M${x-w},${y} C${x-w*0.7},${y-h} ${x+w*0.7},${y-h} ${x+w},${y}`, 1.5);
  for(let i=0;i<3;i++){
    const hx = x + w*(0.2+i*0.22), hy = y - h*(0.62-i*0.2);
    s += tInk(`M${hx},${hy} l${w*0.1},${h*0.28}`, 1);
  }
  return s;
}
function tConifer(x, y, h){
  return tFill(`M${x},${y-h} L${x+h*0.42},${y-h*0.25} L${x+h*0.18},${y-h*0.25} L${x+h*0.5},${y} L${x-h*0.5},${y} L${x-h*0.18},${y-h*0.25} L${x-h*0.42},${y-h*0.25} Z`, '#6f8a4f', 1.2)
    + tInk(`M${x},${y} l0,${h*0.22}`, 1.3);
}
function tCanopy(x, y, r){
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#4f7443" stroke="${TERRAIN_INK}" stroke-width="1.2"></circle>`
    + `<circle cx="${x-r*0.35}" cy="${y-r*0.35}" r="${r*0.35}" fill="#6d9a5a"></circle>`;
}
function tTuft(x, y, s){
  s = s||1;
  return tInk(`M${x-3*s},${y} l${1.5*s},${-5*s} M${x},${y} l0,${-6.5*s} M${x+3*s},${y} l${-1.5*s},${-5*s}`, 1.1);
}
function tWaves(x, y, w, color){
  return `<path d="M${x-w},${y} q${w/4},-4 ${w/2},0 t${w/2},0 t${w/2},0 t${w/2},0" fill="none" stroke="${color||TERRAIN_INK}" stroke-width="1.3" stroke-linecap="round"></path>`;
}
function tHouse(x, y, s){
  return tFill(`M${x-5*s},${y} L${x-5*s},${y-6*s} L${x},${y-11*s} L${x+5*s},${y-6*s} L${x+5*s},${y} Z`, TERRAIN_INK, 1)
    + `<rect x="${x-1.4*s}" y="${y-4*s}" width="${2.8*s}" height="${4*s}" fill="#f0dcc0"></rect>`;
}
function tTower(x, y, w, h){
  const cren = `M${x-w/2},${y-h} l0,-3 l${w/4},0 l0,3 l${w/4},0 l0,-3 l${w/4},0 l0,3 l${w/4},0 l0,-3`;
  return tFill(`M${x-w/2},${y} L${x-w/2},${y-h} L${x+w/2},${y-h} L${x+w/2},${y} Z`, TERRAIN_INK, 1) + tInk(cren, 1.4);
}

const TERRAINS = [
  {id:'hills', label:'Hills', fill:'#e9c79c', draw:()=>
    tHill(-10,4,13) + tHill(11,2,11) + tHill(0,20,13)},
  {id:'hills-icy', label:'Hills, Icy', fill:'#dfe7ea', draw:()=>
    tHill(-10,4,13,true) + tHill(11,2,11,true) + tHill(0,20,13,true)},
  {id:'mountains', label:'Mountains', fill:'#dcc3a2', draw:()=>
    tPeak(-8,16,30,14) + tPeak(12,20,22,11)},
  {id:'mountains-icy', label:'Mountains, Icy', fill:'#eef1f3', draw:()=>
    tPeak(-8,16,30,14,true) + tPeak(12,20,22,11,true)},
  {id:'volcanic', label:'Volcanic', fill:'#caa38a', draw:()=>
    tFill('M-20,18 L-6,-8 L6,-8 L20,18 Z', '#8c6d5b') + tFill('M-6,-8 Q0,-4 6,-8', '#c8452c', 1.4)
    + tInk('M0,-11 q-5,-5 0,-9 t0,-9', 1.3) + `<circle cx="-3" cy="6" r="1.6" fill="#c8452c"></circle><circle cx="5" cy="12" r="1.3" fill="#c8452c"></circle>`},
  {id:'volcanic-icy', label:'Volcanic, Icy', fill:'#e9e5e2', draw:()=>
    tFill('M-20,18 L-6,-8 L6,-8 L20,18 Z', '#a8948a') + tFill('M-12,5 L-6,-8 L6,-8 L12,5 L6,1 L0,5 L-6,1 Z', TERRAIN_SNOW, 1)
    + tFill('M-6,-8 Q0,-4 6,-8', '#c8452c', 1.4) + tInk('M0,-11 q-5,-5 0,-9 t0,-9', 1.3)},
  {id:'desert', label:'Desert', fill:'#f2d08c', draw:()=>
    tInk('M-24,0 q8,-9 16,-2 q6,5 14,-3', 1.4) + tInk('M-8,14 q9,-9 18,-2 q6,5 14,-3', 1.4) + tInk('M-26,22 q6,-5 12,-1', 1.2)
    + `<g fill="${TERRAIN_INK}"><circle cx="-14" cy="9" r="0.9"/><circle cx="4" cy="3" r="0.9"/><circle cx="14" cy="22" r="0.9"/><circle cx="-2" cy="24" r="0.9"/></g>`},
  {id:'desert-steppe', label:'Desert Steppe', fill:'#ead4a2', draw:()=>
    tInk('M-22,4 q8,-7 16,-1', 1.3) + tInk('M4,18 q8,-7 16,-1', 1.3) + tTuft(10,2,0.9) + tTuft(-12,20,0.9) + tTuft(-2,-10,0.8)
    + `<g fill="${TERRAIN_INK}"><circle cx="-6" cy="10" r="0.9"/><circle cx="16" cy="10" r="0.9"/><circle cx="0" cy="26" r="0.9"/></g>`},
  {id:'grassy-plains', label:'Grassy Plains', fill:'#dfd898', draw:()=>
    tTuft(-14,0) + tTuft(4,-8) + tTuft(14,6) + tTuft(-4,14) + tTuft(-18,22,0.8) + tTuft(12,24,0.8)},
  {id:'plateau', label:'Plateau', fill:'#dcc4a0', draw:()=>
    tFill('M-24,16 L-15,-4 L15,-4 L24,16 Z', '#c9a67d') + tInk('M-15,-4 L15,-4', 2)
    + tInk('M-18,4 l3,10 M-10,0 l2,14 M10,0 l-2,14 M18,4 l-3,10', 1)},
  {id:'tar-pits', label:'Tar Pits', fill:'#d1bb9c', draw:()=>
    `<ellipse cx="-8" cy="2" rx="10" ry="6" fill="#1d1712"/><ellipse cx="10" cy="14" rx="8" ry="5" fill="#1d1712"/><ellipse cx="4" cy="-12" rx="5" ry="3.2" fill="#1d1712"/>`
    + `<circle cx="-11" cy="0" r="1.4" fill="#6b5d52"/><circle cx="12" cy="12" r="1.1" fill="#6b5d52"/>`},
  {id:'tundra', label:'Tundra', fill:'#e4ebe6', draw:()=>
    tInk('M-20,-6 l8,0 M-4,-10 l10,0 M10,-2 l9,0 M-16,10 l9,0 M4,8 l8,0 M-6,22 l10,0', 1.2) + tTuft(-12,2,0.7) + tTuft(14,16,0.7) + tTuft(0,-2,0.6)},
  {id:'forest', label:'Forest', fill:'#c8cf98', draw:()=>
    tConifer(-12,4,17) + tConifer(8,0,19) + tConifer(-2,22,17) + tConifer(16,22,14)},
  {id:'rainforest', label:'Rainforest', fill:'#98b27e', draw:()=>
    tCanopy(-10,0,9) + tCanopy(9,-4,9) + tCanopy(0,14,10) + tCanopy(16,14,7) + tCanopy(-17,16,7)},
  {id:'wetlands', label:'Wetlands', fill:'#c3cfa8', draw:()=>
    tWaves(-20,4,16,TERRAIN_WATER) + tWaves(-8,18,16,TERRAIN_WATER) + tInk('M-12,4 l0,-10 M-9,4 l2,-8 M10,-4 l0,-10 M13,-4 l-2,-7 M2,18 l0,-9 M5,18 l2,-7', 1.2)},
  {id:'river', label:'River', fill:'#e9c79c', draw:()=>
    `<path d="M-22,-24 C-6,-12 -16,4 0,6 S12,22 22,30" fill="none" stroke="${TERRAIN_WATER}" stroke-width="5.5" stroke-linecap="round"/>`
    + `<path d="M-22,-24 C-6,-12 -16,4 0,6 S12,22 22,30" fill="none" stroke="#8cc4dc" stroke-width="2" stroke-linecap="round"/>` + tTuft(14,-6,0.8) + tTuft(-16,18,0.8)},
  {id:'lake', label:'Lake', fill:'#e9c79c', draw:()=>
    `<path d="M-16,-4 C-18,-16 2,-18 10,-10 C20,-2 18,14 6,16 C-6,18 -14,8 -16,-4 Z" fill="#8cc4dc" stroke="${TERRAIN_WATER}" stroke-width="1.6"/>`
    + tWaves(-4,2,6,TERRAIN_WATER) + tTuft(-18,20,0.8) + tTuft(18,-16,0.8)},
  {id:'ocean', label:'Ocean', fill:'#86c6c0', draw:()=>
    tWaves(-18,-8,10,'#2f6f73') + tWaves(-4,6,10,'#2f6f73') + tWaves(-20,20,10,'#2f6f73')},
  {id:'obelisk', label:'Great Obelisk', fill:'#e9c79c', draw:()=>
    tFill('M-4,20 L-3,-18 L0,-24 L3,-18 L4,20 Z', TERRAIN_INK, 1) + tInk('M-12,20 L12,20', 2) + tInk('M-1,-14 l0,28', 0.8).replace(TERRAIN_INK,'#8a7a66')},
  {id:'rapids', label:'Rapids at the End of the World', fill:'#86c6c0', draw:()=>
    tWaves(-18,-10,9,'#2f6f73') + tWaves(-14,4,9,'#2f6f73') + tWaves(-18,18,9,'#2f6f73')
    + tFill('M-4,-2 l4,-5 l5,2 l1,4 Z', '#8a7a66', 1) + tFill('M8,12 l3,-4 l4,1 l1,3 Z', '#8a7a66', 1)},
];
// Settlements sit on top of a terrain (or stand alone as a full tile).
const SETTLEMENTS = [
  {id:'city', label:'City', fill:'#e8b48a', draw:()=>
    tFill('M-20,14 L-20,2 L20,2 L20,14 Z', '#b68a66', 1.2) + tTower(-12,14,8,20) + tTower(12,14,8,17) + tTower(0,14,9,26)
    + tHouse(-4,14,0.8) + tHouse(6,14,0.7),
    // Just the symbol, for placing on top of a terrain tile.
    mark:()=> tTower(-9,10,7,16) + tTower(9,10,7,14) + tTower(0,10,8,22)},
  {id:'town', label:'Town / Village', fill:'#ecd0aa', draw:()=>
    tHouse(-7,10,1.3) + tHouse(8,8,1.0) + tHouse(1,18,0.9) + tTuft(-16,18,0.8) + tTuft(16,20,0.8),
    mark:()=> tHouse(0,10,1.6)},
];
const SETTLEMENT_BY_ID = Object.fromEntries(SETTLEMENTS.map(t=>[t.id, t]));
const TERRAIN_BY_ID = Object.fromEntries(TERRAINS.map(t=>[t.id, t]));

// ---- Optional tile images (e.g. cut from the user's own Atlas PDF) ----
// Imported once per device from a local JSON file and kept in IndexedDB —
// never part of the published site. Keys: terrain/settlement ids, plus
// 'city-mark' / 'town-mark' for the overlay symbols.
let TERRAIN_IMAGES = {};
function loadTerrainImages(){
  if(storageBackend!=='idb') return Promise.resolve();
  return idbGet('terrainImages').then(v=>{ TERRAIN_IMAGES = v || {}; }).catch(()=>{});
}
// Uses the permanent hidden <input id="file-import-terrain"> (like the other
// imports): a file input created on the fly and not in the page can be
// garbage-collected by mobile browsers while the file dialog is open — then
// the choice is silently lost.
function triggerTerrainImagesImport(){ document.getElementById('file-import-terrain').click(); }
function handleTerrainImagesFile(input){
  const file = input.files[0];
  input.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const tiles = data && data.format==='solorpg-terrain-images' ? data.tiles : null;
      if(!tiles || typeof tiles!=='object') throw new Error('keine Gelände-Grafik-Datei (erwartet: atlas-terrain-tiles.json)');
      const clean = {};
      Object.entries(tiles).forEach(([k,v])=>{ if(typeof v==='string' && v.startsWith('data:image/')) clean[k]=v; });
      if(!Object.keys(clean).length) throw new Error('keine Grafiken in der Datei');
      if(storageBackend!=='idb') throw new Error('dieser Browser erlaubt keinen IndexedDB-Speicher (z.B. privates Fenster)');
      idbPut('terrainImages', clean).then(()=>{
        TERRAIN_IMAGES = clean; render();
        alert(Object.keys(clean).length+' Gelände-Grafiken importiert.');
      }, e=>alert('Speichern fehlgeschlagen: '+(e.message||e)));
    }catch(e){ alert('Import fehlgeschlagen: '+(e.message||e)); }
  };
  reader.onerror = () => alert('Datei konnte nicht gelesen werden.');
  reader.readAsText(file);
}
function removeTerrainImages(){
  idbPut('terrainImages', {}).then(()=>{ TERRAIN_IMAGES = {}; render(); });
}

// ---- Drawing ----
// Terrain/settlement symbol scaled to a hex/circle of radius r at (x,y).
function terrainSymbolSvg(def, x, y, r, useMark){
  if(!def) return '';
  const body = useMark ? def.mark() : def.draw();
  return `<g transform="translate(${x},${y}) scale(${(r/40).toFixed(3)})" style="pointer-events:none;">${body}</g>`;
}
function terrainFill(id){ const t = TERRAIN_BY_ID[id] || SETTLEMENT_BY_ID[id]; return t ? t.fill : null; }
let tileClipSeq = 0;
// One map tile: terrain (or a stand-alone settlement tile) with an optional
// settlement symbol on top. hex=true draws a pointy-top hex, else a circle.
// Returns '' when there's neither terrain nor settlement.
function mapTileSvg(terrain, settlement, x, y, r, hex, stroke, strokeW){
  const baseId = TERRAIN_BY_ID[terrain] ? terrain : (SETTLEMENT_BY_ID[settlement] ? settlement : null);
  if(!baseId) return '';
  const def = TERRAIN_BY_ID[baseId] || SETTLEMENT_BY_ID[baseId];
  // Transparent fill: the outline doubles as the tap target for the whole tile.
  const outline = hex
    ? `<polygon points="${hexCornersPoints(x,y,r)}" fill="transparent" stroke="${stroke}" stroke-width="${strokeW}"></polygon>`
    : `<circle cx="${x}" cy="${y}" r="${r}" fill="transparent" stroke="${stroke}" stroke-width="${strokeW}"></circle>`;
  let base;
  const img = TERRAIN_IMAGES[baseId];
  if(img){
    const w = hex ? Math.sqrt(3)*r : 2.3*r, h = hex ? 2*r : 2.6*r;
    let clip = '', clipAttr = '';
    if(!hex){
      const id = 'tclip'+(++tileClipSeq);
      clip = `<clipPath id="${id}"><circle cx="${x}" cy="${y}" r="${r}"></circle></clipPath>`;
      clipAttr = `clip-path="url(#${id})"`;
    }
    base = `${clip}<image href="${img}" x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" preserveAspectRatio="none" ${clipAttr}></image>`;
  } else {
    base = (hex
      ? `<polygon points="${hexCornersPoints(x,y,r)}" fill="${def.fill}"></polygon>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="${def.fill}"></circle>`)
      + terrainSymbolSvg(def, x, y, hex ? r*0.92 : r*1.1);
  }
  let overlay = '';
  const set = TERRAIN_BY_ID[terrain] && SETTLEMENT_BY_ID[settlement];
  if(set){
    // Pale disc behind the symbol keeps it readable on dark terrain.
    overlay = `<circle cx="${x}" cy="${y-r*0.08}" r="${r*0.42}" fill="#f3e3c8" opacity="0.85"></circle>`;
    const mark = TERRAIN_IMAGES[settlement+'-mark'];
    overlay += mark
      ? `<image href="${mark}" x="${x-r*0.36}" y="${y-r*0.42}" width="${r*0.72}" height="${r*0.6}" preserveAspectRatio="xMidYMid meet"></image>`
      : terrainSymbolSvg(set, x, y-r*0.1, r*0.9, true);
  }
  return `<g style="pointer-events:none;">${base}${overlay}</g>` + outline;
}
// Small standalone hex swatch for pickers (terrain or settlement id; null = none).
function terrainSwatchSvg(id, size){
  size = size||40;
  const r = size/2 - 1, cx = size/2, cy = size/2;
  const tile = id ? mapTileSvg(id, id, cx, cy, r, true, TERRAIN_INK, 1) : '';
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    ${tile || `<polygon points="${hexCornersPoints(cx,cy,r)}" fill="var(--panel-raised)" stroke="var(--border)" stroke-width="1"></polygon>
      <text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="12" fill="var(--text-faint)">–</text>`}
  </svg>`;
}

// ---- Encounter tables by terrain ----
// A table entry {{@terrain: ANIMAL}} rolls on "<terrain table>: ANIMAL" for
// the terrain the party is in. Candidate table-name prefixes per terrain, in
// order (first existing table wins); e.g. plateau falls back to Hills.
const TERRAIN_TABLE_NAMES = {
  'hills':['Hills'], 'hills-icy':['Hills (Icy)','Hills, Icy'],
  'mountains':['Mountains'], 'mountains-icy':['Mountains (Icy)','Mountains, Icy'],
  'volcanic':['Volcanic'], 'volcanic-icy':['Volcanic (Icy)','Volcanic, Icy'],
  'desert':['Desert'], 'desert-steppe':['Desert Steppe'], 'grassy-plains':['Grassy Plains'],
  'plateau':['Plateau','Hills'], 'tar-pits':['Tar Pits'], 'tundra':['Tundra'],
  'forest':['Forest'], 'rainforest':['Rainforest'], 'wetlands':['Wetlands'],
  'river':['River','Lake River','Lake/River'], 'lake':['Lake','Lake River','Lake/River'], 'ocean':['Ocean'],
  'obelisk':['Great Obelisk','Mountains'], 'rapids':['Rapids at the End of the World','Ocean'],
};
const SETTLEMENT_TABLE_NAMES = { city:['City'], town:['Town Village','Town/Village','Town'] };
const COASTAL_TERRAINS = new Set(['ocean','rapids']);
const DESERT_TERRAINS = new Set(['desert','desert-steppe']);

// Manual override values: a terrain id, or 'city' / 'town' optionally with
// ':coastal' / ':desert'. Stored per campaign (terrainOverride).
function parseTerrainOverride(v){
  if(!v) return null;
  const [base, variant] = v.split(':');
  if(SETTLEMENT_BY_ID[base]) return {terrain:null, settlement:base, coastal:variant==='coastal', desert:variant==='desert'};
  if(TERRAIN_BY_ID[base]) return {terrain:base, settlement:null, coastal:false, desert:DESERT_TERRAINS.has(base)};
  return null;
}
// Where the party is: the manual override if set, else the 📍 marker hex of
// the current map (ignoreOverride: map only). Returns {terrain, settlement, coastal, desert, node, source}
// or null.
function currentTerrainContext(ignoreOverride){
  const active = getActive();
  // '__fixed': location-dependent rolls switched off → {{@terrain: X | Fallback}}
  // always uses its fallback (the table's own fixed terrain).
  if(!ignoreOverride && active.terrainOverride==='__fixed') return null;
  const ov = ignoreOverride ? null : parseTerrainOverride(active.terrainOverride);
  if(ov) return {...ov, node:null, source:'manual'};
  const map = getCurrentMap();
  const node = map && map.markerNodeId ? map.nodes.find(n=>n.id===map.markerNodeId) : null;
  if(!node || !(node.terrain || node.settlement)) return node ? {terrain:null, settlement:null, node, source:'map'} : null;
  let coastal = false;
  if(map.grid==='hex'){
    // Any neighbouring hex (within ~1 cell) that is ocean makes it coastal.
    const reach = Math.sqrt(3)*map.gridSize*1.15;
    coastal = map.nodes.some(o=>o.id!==node.id && COASTAL_TERRAINS.has(o.terrain) && Math.hypot(o.x-node.x, o.y-node.y) <= reach);
  }
  return {terrain:node.terrain, settlement:node.settlement, coastal, desert:DESERT_TERRAINS.has(node.terrain), node, source:'map'};
}
// Ordered table-name prefixes for a context (settlement variants first).
function terrainTablePrefixes(ctx){
  if(!ctx) return [];
  const out = [];
  if(ctx.settlement){
    (SETTLEMENT_TABLE_NAMES[ctx.settlement]||[]).forEach(base=>{
      if(ctx.coastal) out.push(base+' (Coastal)');
      if(ctx.desert) out.push(base+' (Desert)');
      out.push(base);
    });
  }
  if(ctx.terrain) (TERRAIN_TABLE_NAMES[ctx.terrain]||[TERRAIN_BY_ID[ctx.terrain].label]).forEach(p=>out.push(p));
  return out;
}
function terrainContextLabel(ctx){
  if(!ctx) return null;
  const parts = [];
  if(ctx.settlement) parts.push(SETTLEMENT_BY_ID[ctx.settlement].label + (ctx.coastal ? ' (Coastal)' : ctx.desert ? ' (Desert)' : ''));
  if(ctx.terrain) parts.push(TERRAIN_BY_ID[ctx.terrain].label);
  return parts.join(' auf ') || null;
}

// ---- Shared tile definitions (large maps) ----
// Each tile type is drawn once in <defs> (in a 40-unit space, hex
// circumradius 40); every hex then only <use>s it. Keeps a map with
// thousands of hexes small — and imported images appear once instead of once
// per hex.
const TILE_UNIT_W = Math.sqrt(3)*40;
function tileDefsSvg(baseIds, markIds){
  let out = '';
  baseIds.forEach(id=>{
    const def = TERRAIN_BY_ID[id] || SETTLEMENT_BY_ID[id];
    if(!def) return;
    const img = TERRAIN_IMAGES[id];
    out += img
      ? `<g id="tile-${id}"><image href="${img}" x="${-TILE_UNIT_W/2}" y="-40" width="${TILE_UNIT_W}" height="80" preserveAspectRatio="none"></image></g>`
      : `<g id="tile-${id}"><polygon points="${hexCornersPoints(0,0,40)}" fill="${def.fill}"></polygon><g transform="scale(0.92)">${def.draw()}</g></g>`;
  });
  markIds.forEach(id=>{
    const def = SETTLEMENT_BY_ID[id];
    if(!def) return;
    const img = TERRAIN_IMAGES[id+'-mark'];
    out += `<g id="mark-${id}"><circle cx="0" cy="-3.2" r="16.8" fill="#f3e3c8" opacity="0.85"></circle>`
      + (img
        ? `<image href="${img}" x="-14.4" y="-16.8" width="28.8" height="24" preserveAspectRatio="xMidYMid meet"></image>`
        : `<g transform="translate(0,-4) scale(0.9)">${def.mark()}</g>`)
      + `</g>`;
  });
  return out;
}
// Base tile id for a hex: its terrain, else a stand-alone settlement tile.
function tileBaseId(terrain, settlement){
  return TERRAIN_BY_ID[terrain] ? terrain : (SETTLEMENT_BY_ID[settlement] ? settlement : null);
}
// One hex referencing the shared defs. Returns '' if the hex has no tile.
function hexTileUseSvg(terrain, settlement, x, y, r, stroke, strokeW){
  const baseId = tileBaseId(terrain, settlement);
  if(!baseId) return '';
  const k = (r/40).toFixed(4);
  let s = `<use href="#tile-${baseId}" transform="translate(${x},${y}) scale(${k})" style="pointer-events:none;"></use>`;
  if(TERRAIN_BY_ID[terrain] && SETTLEMENT_BY_ID[settlement]) s += `<use href="#mark-${settlement}" transform="translate(${x},${y}) scale(${k})" style="pointer-events:none;"></use>`;
  return s + `<polygon points="${hexCornersPoints(x,y,r)}" fill="transparent" stroke="${stroke}" stroke-width="${strokeW}"></polygon>`;
}
