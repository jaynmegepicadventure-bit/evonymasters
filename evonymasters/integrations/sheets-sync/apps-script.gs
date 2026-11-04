// Bind this script to the private ITEM FINDER spreadsheet.
// Run setupSync() once; do not publish or deploy as a web app.
// Google Apps Script project property SYNC_SECRET must equal the Cloudflare secret.
const SYNC_URL = 'https://evonymasters-sheet-sync.YOUR-SUBDOMAIN.workers.dev/v1/sync';
const BOOK_ID = '1uxhy6wTqcEyywtBp0wvMksKSKjQNjM0kV36ZacCszbU';
function syncRewards() {
  const secret=PropertiesService.getScriptProperties().getProperty('SYNC_SECRET');
  if(!secret)throw new Error('Set SYNC_SECRET in Apps Script project properties first.');
  if(SYNC_URL.includes('YOUR-SUBDOMAIN'))throw new Error('Set SYNC_URL to your deployed sync Worker URL.');
  const file=SpreadsheetApp.openById(BOOK_ID);
  function values(name) {
    const sheet=file.getSheetByName(name);
    if(!sheet)throw new Error('Missing tab: '+name);
    return sheet.getDataRange().getDisplayValues();
  }
  const body=JSON.stringify({version:1,tabs:{
    events:values('EVENTS & ACTIVITIES'),monsters:values('MONSTERS'),boxes:values('IN THE BOXES')
  }});
  const stamp=String(Date.now());
  const bytes=Utilities.computeHmacSha256Signature(stamp+'.'+body,secret,Utilities.Charset.UTF_8);
  const hex=bytes.map(n=>('0'+(n&255).toString(16)).slice(-2)).join('');
  const result=UrlFetchApp.fetch(SYNC_URL,{
    method:'post',contentType:'application/json',payload:body,muteHttpExceptions:true,
    headers:{'x-sync-timestamp':stamp,'x-sync-signature':hex}
  });
  if(result.getResponseCode()!==200)throw new Error('Sync failed '+result.getResponseCode()+': '+result.getContentText());
  console.log(result.getContentText());
}
function setupSync() {
  // Only one scheduled trigger for this function per spreadsheet.
  ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncRewards')
    .forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncRewards').timeBased().everyMinutes(5).create();
  syncRewards();
}
