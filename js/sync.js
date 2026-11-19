// Saving campaigns to GitHub, so one campaign can be played on phone and PC
// in turns. Each campaign is one JSON file (same format as the export) in a
// branch of the user's own repository, written through the GitHub REST API
// with a fine-grained token that only this device knows.
//
// Per device (localStorage, never exported):
//   cfg   – repo "owner/name", branch, folder, token, device name
//   camps – per local campaign id: {path, sha, hash, at}
//           sha  = the file version this device last saved or loaded
//           hash = hash of the campaign data at that moment (changed since?)
// Conflicts: a save sends the sha it knows; if the file changed on GitHub in
// the meantime, GitHub refuses and the app asks which version should win.
const SYNC_KEY = 'solorpg-sync';
const SYNC_VERSION = 4;   // shown in the options, to see which version a device runs
const SYNC_AUTOSAVE_MS = 5*60*1000;   // at most one automatic save per 5 minutes
const SYNC_CHECK_MS = 30*1000;        // check for a newer version at most every 30 s

let syncStore = (()=>{
  try{ const s = JSON.parse(localStorage.getItem(SYNC_KEY)||'{}'); return {cfg:s.cfg||{}, camps:s.camps||{}}; }
  catch(e){ return {cfg:{}, camps:{}}; }
})();
let syncBranchReady = false, syncLastCheck = 0, syncChanged = false;
ui.sync = {busy:false, error:null, remote:null, listOpen:false, list:null};

function syncPersist(){ try{ localStorage.setItem(SYNC_KEY, JSON.stringify(syncStore)); }catch(e){} }
function syncCfg(){
  const c = syncStore.cfg;
  // Also accept a pasted URL: https://github.com/owner/name(.git)
  const repo = (c.repo||'').trim().replace(/^https?:\/\/(www\.)?github\.com\//i,'').replace(/\.git$/i,'').replace(/\/+$/,'');
  return {repo, branch:(c.branch||'saves').trim(), folder:(c.folder||'saves').trim().replace(/^\/+|\/+$/g,''),
    token:(c.token||'').trim(), device:(c.device||'').trim() || (/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Handy' : 'PC')};
}
function syncConfigured(){ const c = syncCfg(); return !!(c.repo && c.token && /^[^/\s]+\/[^/\s]+$/.test(c.repo)); }
function syncCampState(id){ return syncStore.camps[id] || null; }

// FNV-1a over the campaign data: "changed since the last save/load?" without keeping a copy.
function syncHash(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h>>>0).toString(16)+':'+str.length;
}
function syncDataHash(id){ return syncHash(JSON.stringify(STATE.campaignData[id]||{})); }
function syncUtf8ToB64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for(let i=0;i<bytes.length;i+=0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
  return btoa(bin);
}
function syncSlug(name){
  const s = String(name||'kampagne').toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  return s || 'kampagne';
}

// ---- GitHub REST calls ----
async function ghFetch(method, path, body, accept){
  const c = syncCfg();
  // Only headers GitHub allows from web pages (CORS); a cache-busting query
  // parameter instead of a cache header for the same reason.
  const url = `https://api.github.com/repos/${c.repo}${path ? '/' + path : ''}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
  try{
    return await fetch(url, {
      method,
      headers: {'Authorization':'Bearer '+c.token, 'Accept': accept || 'application/vnd.github+json', ...(body ? {'Content-Type':'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
    });
  }catch(e){
    throw new Error(navigator.onLine===false ? 'Kein Internet' : `Keine Verbindung zu GitHub (${e.message||e}). Schlüssel enthält evtl. Leerzeichen oder Zeilenumbruch?`);
  }
}
function ghError(res, what){
  const hint = res.status===401 ? 'Schlüssel ungültig oder abgelaufen'
    : res.status===403 ? 'Schlüssel hat keine Schreibrechte für dieses Repo'
    : res.status===404 ? 'Repo nicht gefunden (Name prüfen, Schlüssel muss Zugriff auf genau dieses Repo haben)'
    : 'Fehler '+res.status;
  return new Error(`${what}: ${hint}`);
}
const ghPath = p => p.split('/').map(encodeURIComponent).join('/');
async function ghMeta(path){
  const res = await ghFetch('GET', `contents/${ghPath(path)}?ref=${encodeURIComponent(syncCfg().branch)}`);
  if(res.status===404) return null;
  if(!res.ok) throw ghError(res, 'Abfrage');
  return res.json();
}
async function ghRaw(path){
  // Raw media type: also works for files over 1 MB.
  const res = await ghFetch('GET', `contents/${ghPath(path)}?ref=${encodeURIComponent(syncCfg().branch)}`, null, 'application/vnd.github.raw+json');
  if(!res.ok) throw ghError(res, 'Laden');
  return res.text();
}
// The saves live in their own branch, so they don't mix with the repo's main history.
async function ghEnsureBranch(){
  if(syncBranchReady) return;
  const c = syncCfg();
  let res = await ghFetch('GET', `git/ref/heads/${encodeURIComponent(c.branch)}`);
  if(res.status===404){
    const repoRes = await ghFetch('GET', '');
    if(!repoRes.ok) throw ghError(repoRes, 'Repo');
    const repo = await repoRes.json();
    const baseRes = await ghFetch('GET', `git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
    if(!baseRes.ok) throw ghError(baseRes, 'Branch');
    const base = await baseRes.json();
    res = await ghFetch('POST', 'git/refs', {ref:'refs/heads/'+c.branch, sha:base.object.sha});
    if(!res.ok && res.status!==422) throw ghError(res, 'Branch anlegen');
  } else if(!res.ok) throw ghError(res, 'Branch');
  syncBranchReady = true;
}

// ---- Save / check / load ----
function syncFileText(id){
  const camp = STATE.campaigns.find(c=>c.id===id);
  return JSON.stringify({app:'solo-rpg', exportKind:'campaign', campaign:{id, name:camp?camp.name:'Kampagne'},
    savedAt:new Date().toISOString(), savedBy:syncCfg().device, data:STATE.campaignData[id]});
}
function syncPathFor(id){
  const st = syncCampState(id);
  if(st && st.path) return st.path;
  const camp = STATE.campaigns.find(c=>c.id===id);
  const taken = new Set(Object.entries(syncStore.camps).filter(([k])=>k!==id).map(([,v])=>v.path));
  const base = `${syncCfg().folder}/${syncSlug(camp && camp.name)}`;
  let path = base+'.json', n = 2;
  while(taken.has(path)) path = `${base}-${n++}.json`;
  return path;
}
// force: overwrite whatever is online (the user chose "keep this device's version").
async function syncSave(id, opts){
  opts = opts || {};
  id = id || STATE.activeCampaignId;
  if(!syncConfigured() || ui.sync.busy) return false;
  await flushSave();
  const st = syncCampState(id) || {};
  const hash = syncDataHash(id);
  if(!opts.force && st.sha && st.hash===hash){
    if(!opts.quiet) showToast('☁ Schon gespeichert');
    syncChanged = false; render(); return true;
  }
  ui.sync.busy = true; ui.sync.error = null; render();
  try{
    await ghEnsureBranch();
    const path = syncPathFor(id);
    let sha = st.sha;
    if(opts.force || !sha){
      const meta = await ghMeta(path);
      if(meta && !opts.force && !st.sha){
        // A file with this name exists, but this device never saved or loaded it.
        ui.sync.busy = false;
        await syncCheck(id, true, path);
        return false;
      }
      sha = meta ? meta.sha : undefined;
    }
    const camp = STATE.campaigns.find(c=>c.id===id);
    const res = await ghFetch('PUT', `contents/${ghPath(path)}`, {
      message: `${camp ? camp.name : 'Kampagne'} – gespeichert (${syncCfg().device})`,
      content: syncUtf8ToB64(syncFileText(id)), branch: syncCfg().branch, ...(sha ? {sha} : {}),
    });
    if(res.status===409 || res.status===422){
      // Changed on GitHub since this device last saved/loaded it.
      ui.sync.busy = false;
      await syncCheck(id, true);
      return false;
    }
    if(!res.ok) throw ghError(res, 'Speichern');
    const out = await res.json();
    syncStore.camps[id] = {path, sha: out.content.sha, hash, at: Date.now()};
    syncPersist();
    syncChanged = false;
    if(ui.sync.remote && ui.sync.remote.campId===id) ui.sync.remote = null;
    if(!opts.quiet) showToast('☁ Gespeichert');
    return true;
  }catch(e){
    ui.sync.error = (e && e.message) || String(e);
    return false;
  }finally{
    ui.sync.busy = false; render();
  }
}
// Is there a newer version on GitHub? Shows a banner to load it (or, if both
// sides changed, to choose). force: check even if checked a moment ago.
async function syncCheck(id, force, pathOverride){
  id = id || STATE.activeCampaignId;
  if(!syncConfigured()) return;
  const st = syncCampState(id);
  const path = pathOverride || (st && st.path);
  if(!path) return;
  if(!force && Date.now()-syncLastCheck < SYNC_CHECK_MS) return;
  syncLastCheck = Date.now();
  try{
    const meta = await ghMeta(path);
    if(!meta || (st && meta.sha===st.sha)){ if(ui.sync.remote && ui.sync.remote.campId===id){ ui.sync.remote = null; render(); } return; }
    const text = await ghRaw(path);
    const file = JSON.parse(text);
    const localChanged = !st || !st.sha || syncDataHash(id)!==st.hash;
    ui.sync.remote = {campId:id, path, sha:meta.sha, text, savedAt:file.savedAt||null, savedBy:file.savedBy||'', conflict:localChanged};
    ui.sync.error = null;
    render();
  }catch(e){
    ui.sync.error = (e && e.message) || String(e);
    render();
  }
}
function syncApplyFile(id, text, path, sha){
  const file = JSON.parse(text);
  if(!file || !file.data) throw new Error('keine Kampagnen-Datei');
  backupNow('Vor Laden von GitHub');
  STATE.campaignData[id] = ensureCampaign(file.data);
  normalizedCampaign = null;
  syncStore.camps[id] = {path, sha, hash:syncDataHash(id), at:Date.now()};
  syncPersist();
  saveState();
  syncChanged = false;   // the loaded state is the saved one
}
function syncLoadRemote(){
  const r = ui.sync.remote;
  if(!r) return;
  try{ syncApplyFile(r.campId, r.text, r.path, r.sha); ui.sync.remote = null; showToast('☁ Geladen'); }
  catch(e){ ui.sync.error = 'Laden: '+(e.message||e); }
  render();
}
function syncKeepLocal(){ const r = ui.sync.remote; ui.sync.remote = null; syncSave(r ? r.campId : null, {force:true}); }
function syncDismissRemote(){ ui.sync.remote = null; render(); }

// "Aus GitHub laden…": all saved campaigns in the folder.
async function openSyncList(){
  ui.sync.listOpen = true; ui.sync.list = null; ui.sync.error = null; render();
  try{
    const res = await ghFetch('GET', `contents/${ghPath(syncCfg().folder)}?ref=${encodeURIComponent(syncCfg().branch)}`);
    if(res.status===404){ ui.sync.list = []; render(); return; }
    if(!res.ok) throw ghError(res, 'Liste');
    ui.sync.list = (await res.json()).filter(f=>f.type==='file' && /\.json$/i.test(f.name)).map(f=>({path:f.path, name:f.name, size:f.size, sha:f.sha}));
  }catch(e){ ui.sync.error = e.message||String(e); ui.sync.list = []; }
  render();
}
function closeSyncList(){ ui.sync.listOpen = false; render(); }
async function syncLoadFromList(path, sha){
  try{
    const text = await ghRaw(path);
    const file = JSON.parse(text);
    // Already on this device? Replace it; otherwise add it as a new campaign.
    let id = Object.keys(syncStore.camps).find(k=>syncStore.camps[k].path===path && STATE.campaigns.some(c=>c.id===k));
    if(!id){
      id = uid();
      STATE.campaigns.push({id, name:(file.campaign && file.campaign.name) || path.split('/').pop().replace(/\.json$/i,'')});
    }
    syncApplyFile(id, text, path, sha);
    STATE.activeCampaignId = id;
    normalizedCampaign = null;
    ui.sync.listOpen = false;
    saveState(); syncChanged = false; render();
    showToast('☁ Geladen');
  }catch(e){ ui.sync.error = 'Laden: '+(e.message||e); render(); }
}

// ---- Automatic saving and checking ----
// storage.js calls this on every change.
function syncNoteChange(){ syncChanged = true; }
function syncAutoSave(){
  if(!syncConfigured() || !syncChanged || ui.sync.busy || ui.sync.remote) return;
  const id = STATE.activeCampaignId, st = syncCampState(id);
  if(!st || !st.sha) return;   // only campaigns saved once by hand
  if(Date.now()-(st.at||0) < SYNC_AUTOSAVE_MS) return;
  syncSave(id, {quiet:true});
}
setInterval(syncAutoSave, 60*1000);
document.addEventListener('visibilitychange', ()=>{
  if(!syncConfigured()) return;
  if(document.visibilityState==='hidden'){
    // Leaving the app: save if something changed (no 5-minute wait, but not more than once a minute).
    const st = syncCampState(STATE.activeCampaignId);
    if(syncChanged && st && st.sha && !ui.sync.remote && Date.now()-(st.at||0) > 60*1000) syncSave(null, {quiet:true});
  } else syncCheck(null, false);
});

// ---- UI ----
function renderSyncHeaderButton(){
  if(!syncConfigured()) return '';
  const st = syncCampState(STATE.activeCampaignId);
  const unsaved = !st || !st.sha || syncChanged;
  return `<button class="icon-btn sync-btn ${unsaved?'unsaved':''}" onclick="syncSave()" title="${unsaved ? 'Auf GitHub speichern (ungespeicherte Änderungen)' : 'Auf GitHub gespeichert'}" aria-label="Speichern">${ui.sync.busy ? '⏳' : '☁'}</button>`;
}
function syncWhen(iso){
  if(!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
}
function renderSyncBanner(){
  const r = ui.sync.remote;
  if(r && r.campId===STATE.activeCampaignId){
    const from = [r.savedBy, syncWhen(r.savedAt)].filter(Boolean).join(', ');
    return r.conflict
      ? `<div class="sync-banner warn"><span>⚠️ Diese Kampagne wurde hier <b>und</b> online geändert${from ? ` (online: ${escapeHtml(from)})` : ''}. Welcher Stand soll gelten?</span>
          <div class="row wrap" style="gap:6px;"><button class="btn btn-gold" onclick="syncLoadRemote()">Online-Stand laden</button><button class="btn btn-raised" onclick="syncKeepLocal()">Diesen Stand behalten</button></div></div>`
      : `<div class="sync-banner"><span>☁ Neuerer Stand online${from ? ` (${escapeHtml(from)})` : ''}.</span>
          <div class="row wrap" style="gap:6px;"><button class="btn btn-gold" onclick="syncLoadRemote()">Laden</button><button class="btn btn-raised" onclick="syncDismissRemote()">Später</button></div></div>`;
  }
  if(ui.sync.error) return `<div class="sync-banner warn"><span>☁ ${escapeHtml(ui.sync.error)}</span><button class="icon-btn" onclick="ui.sync.error=null; render();">✕</button></div>`;
  return '';
}
function renderSyncListModal(){
  const list = ui.sync.list;
  const rows = list===null ? '<p class="small-muted">Lade Liste…</p>'
    : !list.length ? '<p class="small-muted">Noch keine Speicherstände in diesem Repo.</p>'
    : list.map(f=>`<button class="table-row row between" style="color:var(--text);text-align:left;" onclick="syncLoadFromList(${jsStr(f.path)}, ${jsStr(f.sha)})"><span>${escapeHtml(f.name.replace(/\.json$/i,''))}</span><span class="small-muted">${formatBytes(f.size)}</span></button>`).join('');
  return `<div class="modal-overlay"><div class="modal-sheet">
    <div class="row between"><span class="label" style="color:var(--gold);">☁ Aus GitHub laden</span><button class="icon-btn" onclick="closeSyncList()">✕</button></div>
    <p class="small-muted" style="margin:0;">Eine Kampagne, die es auf diesem Gerät schon gibt, wird ersetzt (vorher wird gesichert); sonst kommt sie neu dazu.</p>
    <div class="table-rows">${rows}</div>
  </div></div>`;
}
function onSyncCfg(key, el){ syncStore.cfg = {...syncStore.cfg, [key]: el.value}; syncBranchReady = false; syncPersist(); }
async function testSyncConnection(){
  ui.sync.testMsg = 'Prüfe…'; render();
  // Step 1: GitHub at all, without key (a request browsers send without extra checks).
  try{ await fetch('https://api.github.com/rate_limit?t='+Date.now()); }
  catch(e){
    ui.sync.testMsg = '✘ Dieser Browser erreicht api.github.com gar nicht. Häufige Ursachen: Werbe-/Tracking-Blocker (Ausnahme für diese Seite setzen), strenger Tracking-Schutz, oder die App läuft noch in der alten Version (ganz schließen und neu öffnen).';
    render(); return;
  }
  if(!syncCfg().token){ ui.sync.testMsg = '✘ Kein Schlüssel eingetragen.'; render(); return; }
  if(!/^[\x21-\x7e]+$/.test(syncCfg().token)){ ui.sync.testMsg = '✘ Der Schlüssel enthält ungültige Zeichen (Leerzeichen, Zeilenumbruch oder Sonderzeichen). Bitte neu einfügen.'; render(); return; }
  try{
    const res = await ghFetch('GET', '');
    if(!res.ok) throw ghError(res, 'Verbindung');
    const repo = await res.json();
    ui.sync.testMsg = repo.permissions && repo.permissions.push===false ? '⚠️ Verbunden, aber ohne Schreibrecht.' : `✔ Verbunden mit ${repo.full_name}${repo.private ? ' (privat)' : ' (öffentlich!)'}`;
  }catch(e){ ui.sync.testMsg = '✘ '+(e.message||e); }
  render();
}
function renderSyncOptions(){
  const c = syncCfg(), raw = syncStore.cfg;
  const field = (key, label, val, ph, type) => `<label class="small-muted" style="display:flex;flex-direction:column;gap:4px;">${label}
    <input type="${type||'text'}" value="${escapeHtml(val||'')}" placeholder="${escapeHtml(ph)}" oninput="onSyncCfg('${key}',this)" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`;
  return `<div style="display:flex;flex-direction:column;gap:8px;">
    <span class="label">☁ Speichern auf GitHub</span>
    <p class="small-muted" style="margin:0;">Speichert jede Kampagne als Datei in einem eigenen Branch deines Repos, damit du sie auf Handy und PC abwechselnd spielen kannst. Einstellungen und Schlüssel bleiben nur auf diesem Gerät und kommen nicht in Exporte.</p>
    ${field('repo','Repo (Besitzer/Name)', raw.repo, 'z.B. aron-fer/solo-procedures')}
    ${field('token','Zugriffsschlüssel (Fine-grained token)', raw.token, 'github_pat_…', 'password')}
    ${field('device','Name dieses Geräts', raw.device, c.device)}
    <details><summary class="small-muted" style="cursor:pointer;">Erweitert (Branch, Ordner)</summary>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
        ${field('branch','Branch', raw.branch, 'saves')}
        ${field('folder','Ordner', raw.folder, 'saves')}
      </div></details>
    <div class="row wrap" style="gap:8px;align-items:center;">
      <button class="btn btn-raised" onclick="testSyncConnection()">Verbindung testen</button>
      ${ui.sync.testMsg ? `<span class="small-muted">${escapeHtml(ui.sync.testMsg)}</span>` : ''}
      <span class="small-muted" style="margin-left:auto;">Version ${SYNC_VERSION}</span>
    </div>
    <details><summary class="small-muted" style="cursor:pointer;">So bekommst du den Schlüssel</summary>
      <ol class="small-muted" style="margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;">
        <li>GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.</li>
        <li>Expiration: bis zu 1 Jahr. Repository access: <b>Only select repositories</b> → nur dein Speicher-Repo.</li>
        <li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Sonst nichts.</li>
        <li>Generate token, kopieren, hier einfügen. Auf jedem Gerät einmal.</li>
      </ol></details>
  </div>`;
}
