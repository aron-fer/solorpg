// Boot: load state, wire events, first render, service worker. Must load last.
document.getElementById('file-import').addEventListener('change', function(){ handleImportFile(this); });
document.getElementById('file-import-tables').addEventListener('change', function(){ handleTableImportFile(this); });
document.getElementById('file-import-terrain').addEventListener('change', function(){ handleTerrainImagesFile(this); });
// Re-render when the window crosses into or out of the PC layout.
let resizeIsDesk = window.innerWidth>=1100;
window.addEventListener('resize', function(){
  if(!stateLoaded) return;
  sizeMapLayout();
  const nowDesk = isDesk();
  if(nowDesk !== resizeIsDesk){
    resizeIsDesk = nowDesk;
    render();
  }
});
// Statblock lines of a character shown in the Kampf tab act on that character
// (ui.sbCharId, set when touching them); touching anywhere else ends that.
document.addEventListener('pointerdown', ()=>{ ui.sbCharId = null; }, true);
document.addEventListener('focusin', ()=>{ ui.sbCharId = null; }, true);
loadState().then(()=>loadTerrainImages()).then(()=>{
  startupBackup();
  render();
  syncCheck(null, true);   // newer version saved on another device?
  requestPersistentStorage();
});
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js');
}
