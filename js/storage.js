// Persistence: IndexedDB (large quota) with automatic backups. localStorage is
// only read once to migrate old data, and used as fallback if IndexedDB is
// unavailable (e.g. some private-browsing modes).
//
// IndexedDB layout (database "solorpg"):
//   kv       'state'        -> JSON string of STATE (same shape as before)
//            'backupIndex'  -> [{id, time, bytes, reason, names}] newest first
//   backups  <id>           -> JSON string of STATE at that time
const IDB_NAME = 'solorpg';
const IDB_VERSION = 1;
const BACKUP_KEEP = 10;
const BACKUP_INTERVAL_MS = 10*60*1000;

let storageBackend = 'idb';   // 'idb' | 'local'
let stateLoaded = false;      // never save before the real state is loaded
let saveTimeout = null;
// Last save failure — shown as a banner so failed saves are never silent.
let saveError = null;
let lastSavedBytes = 0;
let lastBackupTime = 0;
let lastBackupJson = null;
let storageEstimate = null;   // {usage, quota} from navigator.storage.estimate()
var storagePersisted = null;  // true/false once known, null = unknown

let idbPromise = null;
function openDb(){
  if(!idbPromise){
    idbPromise = new Promise((resolve, reject)=>{
      if(!window.indexedDB){ reject(new Error('IndexedDB nicht verfügbar')); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if(!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blockiert'));
    });
    idbPromise.catch(()=>{ idbPromise = null; });
  }
  return idbPromise;
}
// Runs fn(stores...) in one transaction; resolves with fn's request result
// once the transaction has committed.
function idbTx(storeNames, mode, fn){
  return openDb().then(db => new Promise((resolve, reject)=>{
    const tx = db.transaction(storeNames, mode);
    let result;
    const req = fn(...storeNames.map(n=>tx.objectStore(n)));
    if(req) req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichern abgebrochen'));
  }));
}
const idbGet = (key) => idbTx(['kv'], 'readonly', kv => kv.get(key));
const idbPut = (key, value) => idbTx(['kv'], 'readwrite', kv => kv.put(value, key));

function freshState(){
  const id = uid();
  return { campaigns:[{id, name:'Kampagne 1'}], campaignData:{[id]: emptyCampaignData()}, activeCampaignId:id };
}

async function loadState(){
  let raw = null, source = null;
  try{
    raw = await idbGet('state');
    if(raw) source = 'idb';
  }catch(e){
    storageBackend = 'local';
  }
  if(!raw){
    try{
      raw = localStorage.getItem(STORAGE_KEY);
      if(raw) source = 'local';
      else{
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if(legacy){ raw = JSON.stringify(migrateLegacy(JSON.parse(legacy))); source = 'legacy'; }
      }
    }catch(e){}
  }
  STATE = null;
  if(raw){
    try{ STATE = JSON.parse(raw); lastSavedBytes = raw.length; }
    catch(e){
      // Keep the unreadable data as a backup instead of overwriting it.
      if(storageBackend==='idb') try{ await addBackup(raw, 'Unlesbare Daten'); }catch(_){}
    }
  }
  if(!STATE || !STATE.campaigns || !STATE.campaignData) STATE = freshState();
  if(!STATE.campaigns.some(c=>c.id===STATE.activeCampaignId)) STATE.activeCampaignId = STATE.campaigns[0].id;
  stateLoaded = true;

  // One-time move from localStorage: write to IndexedDB, read it back, and
  // only then drop the localStorage copy (keeps its 5 MB free, avoids a
  // stale copy resurfacing later).
  if(storageBackend==='idb' && (source==='local' || source==='legacy')){
    try{
      await idbPut('state', raw);
      if(await idbGet('state') === raw){
        await addBackup(raw, 'Umzug aus localStorage');
        if(source==='local') localStorage.removeItem(STORAGE_KEY);
      }
    }catch(e){ storageBackend = 'local'; }
  }
}

function saveState(){
  if(saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(flushSave, 300);
}
function flushSave(){
  if(saveTimeout){ clearTimeout(saveTimeout); saveTimeout=null; }
  if(!stateLoaded) return Promise.resolve();
  let json;
  try{ json = JSON.stringify(STATE); }catch(e){ setSaveResult(e); return Promise.resolve(); }
  const write = storageBackend==='idb'
    ? idbPut('state', json)
    : new Promise(resolve=>{ localStorage.setItem(STORAGE_KEY, json); resolve(); });
  return write.then(()=>{
    lastSavedBytes = json.length;
    setSaveResult(null);
    if(Date.now()-lastBackupTime > BACKUP_INTERVAL_MS) addBackup(json, 'Automatisch').catch(()=>{});
  }, e=>setSaveResult(e));
}
function setSaveResult(e){
  const hadError = !!saveError;
  if(!e) saveError = null;
  else saveError = (e.name==='QuotaExceededError' || e.code===22 || e.code===1014)
    ? 'Speicher voll — Änderungen werden NICHT gespeichert. Bitte exportieren und alte Kampagnen/Logs löschen.'
    : 'Speichern fehlgeschlagen ('+(e.message||e)+'). Bitte jetzt exportieren.';
  if(hadError !== !!saveError) render();
}
// Don't lose the last debounced change when the app is closed/backgrounded.
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && saveTimeout) flushSave(); });
window.addEventListener('pagehide', ()=>{ if(saveTimeout) flushSave(); });
function formatBytes(n){ return n>=1048576 ? (n/1048576).toFixed(1)+' MB' : Math.round(n/1024)+' KB'; }

// ---- Backups ----
function backupNames(json){
  try{ return JSON.parse(json).campaigns.map(c=>c.name).join(', '); }catch(e){ return ''; }
}
// Stores a snapshot and trims to the newest BACKUP_KEEP. Skips identical
// consecutive snapshots.
function addBackup(json, reason){
  if(storageBackend!=='idb') return Promise.resolve();
  if(json===lastBackupJson){ lastBackupTime = Date.now(); return Promise.resolve(); }
  const now = Date.now();
  return idbTx(['kv','backups'], 'readwrite', (kv, backups)=>{
    const idxReq = kv.get('backupIndex');
    idxReq.onsuccess = ()=>{
      const index = idxReq.result || [];
      const id = Math.max(now, index.length ? index[0].id+1 : 0);
      index.unshift({id, time:now, bytes:json.length, reason, names:backupNames(json)});
      backups.put(json, id);
      while(index.length > BACKUP_KEEP) backups.delete(index.pop().id);
      kv.put(index, 'backupIndex');
    };
  }).then(()=>{ lastBackupJson = json; lastBackupTime = now; });
}
function getBackupJson(id){ return idbTx(['backups'], 'readonly', b => b.get(id)); }
function refreshBackups(){
  if(storageBackend!=='idb'){ ui.backups = []; return Promise.resolve(); }
  return idbGet('backupIndex').then(index=>{ ui.backups = index || []; if(ui.showOptions) render(); }).catch(()=>{ ui.backups = []; });
}
function refreshStorageInfo(){
  if(!(navigator.storage && navigator.storage.estimate)) return;
  navigator.storage.estimate().then(est=>{ storageEstimate = est; if(ui.showOptions) render(); }).catch(()=>{});
}
// Snapshot at startup, so every session can be rolled back to how it began.
async function startupBackup(){
  if(storageBackend!=='idb') return;
  lastBackupTime = Date.now(); // keep the first save from racing this snapshot
  const json = JSON.stringify(STATE); // as loaded, before the first render normalizes it
  try{
    const index = await idbGet('backupIndex') || [];
    if(index[0]) lastBackupJson = await getBackupJson(index[0].id);
    await addBackup(json, 'App-Start');
  }catch(e){}
}
// Called before imports so they can be undone from the backup list.
function backupNow(reason){
  if(!stateLoaded) return Promise.resolve();
  return addBackup(JSON.stringify(STATE), reason).catch(()=>{});
}
function manualBackup(){
  backupNow('Manuell').then(refreshBackups);
}
function askRestoreBackup(id){ ui.confirmRestoreBackupId = id; render(); }
function cancelRestoreBackup(){ ui.confirmRestoreBackupId = null; render(); }
async function restoreBackup(id){
  ui.confirmRestoreBackupId = null;
  try{
    const json = await getBackupJson(id);
    const parsed = JSON.parse(json);
    if(!parsed || !parsed.campaigns || !parsed.campaignData) throw new Error('ungültig');
    await flushSave();
    await backupNow('Vor Wiederherstellung');
    STATE = parsed;
    if(!STATE.campaigns.some(c=>c.id===STATE.activeCampaignId)) STATE.activeCampaignId = STATE.campaigns[0].id;
    normalizedCampaign = null;
    ui.activeTab = 'notes';
    await flushSave();
    await refreshBackups();
    render();
    alert('Sicherung wiederhergestellt.');
  }catch(e){
    alert('Wiederherstellen fehlgeschlagen: '+(e.message||e));
  }
}
async function downloadBackup(id){
  const meta = (ui.backups||[]).find(b=>b.id===id);
  const json = await getBackupJson(id);
  if(!json) return;
  const blob = new Blob([json], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date(meta ? meta.time : Date.now()).toISOString().slice(0,16).replace(/[:T]/g,'-');
  a.href = url; a.download = `solorpg-sicherung-${stamp}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function requestPersistentStorage(){
  // Ask the browser not to evict our data under storage pressure (matters
  // most for installed PWAs on iOS/Android).
  if(!(navigator.storage && navigator.storage.persist)) return;
  navigator.storage.persisted()
    .then(p => p ? true : navigator.storage.persist())
    .then(p => { storagePersisted = !!p; })
    .catch(()=>{});
}
