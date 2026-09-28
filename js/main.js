// Boot: load state, wire events, first render, service worker. Must load last.
document.getElementById('file-import').addEventListener('change', function(){ handleImportFile(this); });
document.getElementById('file-import-tables').addEventListener('change', function(){ handleTableImportFile(this); });
let resizeIsWide = window.innerWidth>=900;
window.addEventListener('resize', function(){
  if(!stateLoaded) return;
  const nowWide = window.innerWidth>=900;
  if(nowWide !== resizeIsWide){
    resizeIsWide = nowWide;
    render();
  }
});
loadState().then(()=>{
  startupBackup();
  render();
  requestPersistentStorage();
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js');
}
