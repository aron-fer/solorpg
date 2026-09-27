// Boot: load state, wire events, first render, service worker. Must load last.
loadState();
document.getElementById('file-import').addEventListener('change', function(){ handleImportFile(this); });
document.getElementById('file-import-tables').addEventListener('change', function(){ handleTableImportFile(this); });
let resizeIsWide = window.innerWidth>=900;
window.addEventListener('resize', function(){
  const nowWide = window.innerWidth>=900;
  if(nowWide !== resizeIsWide){
    resizeIsWide = nowWide;
    render();
  }
});
render();
// Ask the browser not to evict our localStorage under storage pressure
// (matters most for installed PWAs on iOS/Android). null = unknown/unsupported.
var storagePersisted = null;
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted()
    .then(p => p ? true : navigator.storage.persist())
    .then(p => { storagePersisted = !!p; })
    .catch(()=>{});
}
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js');
}
