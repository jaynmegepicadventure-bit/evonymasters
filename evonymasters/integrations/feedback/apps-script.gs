/**
 * EvonyMasters feedback receiver for a Google Apps Script Web App.
 * Deploy as: Execute as ME; access ANYONE. The shared secret MUST be set
 * under Script Properties and known only to this script and the Cloudflare Worker.
 * Never share this /exec URL or credential in public source code.
 *
 * Script Properties:
 * FEEDBACK_SHARED_SECRET : random 32+ char secret (same as Worker)
 * FEEDBACK_FOLDER_ID : ID of private Google Drive folder
 * FEEDBACK_SHEET_ID : ID of private Google Spreadsheet
 * FEEDBACK_NOTIFY_EMAIL : destination inbox (e.g. contact@evonymasters.com)
 */
const HEADERS = ["Reference","Received at UTC","Category","Player name","Reply email","Page / tool","Message","Attachment count","Attachment links","Email notification"];
const ACCEPTED = ["image/png","image/jpeg","image/webp","application/pdf","text/plain"];
const MAX_FILE = 2 * 1024 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;
function output_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function safeCell_(value) {
  const s = String(value == null ? "" : value);
  return /^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
function valid_(a) {
  if (!a || typeof a !== "object") throw Error("Invalid submission");
  const string = x => typeof x === "string" ? x : "";
  const id = string(a.id);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id) || id.length !== 36) throw Error("Invalid ID");
  if (!["data","bug","idea","question","other"].includes(a.category)) throw Error("Invalid category");
  if (string(a.message).trim().length < 15 || string(a.message).length > 4000) throw Error("Invalid message");
  if (string(a.name).length > 100 || string(a.email).length > 200 || string(a.page).length > 300) throw Error("Field too long");
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw Error("Invalid email");
  if (!Array.isArray(a.attachments) || a.attachments.length > 5) throw Error("Too many files");
  let size = 0;
  for (const f of a.attachments) {
    if (!f || typeof f !== "object" || typeof f.name !== "string" || f.name.length > 160 ||
        !/^[\w .()\-]+$/.test(f.name) || !ACCEPTED.includes(f.mimeType) ||
        !Number.isInteger(f.size) || f.size <= 0 || f.size > MAX_FILE ||
        typeof f.base64 !== "string" || f.base64.length > Math.ceil(MAX_FILE * 4 / 3) + 8)
      throw Error("Invalid attachment");
    size += f.size;
  }
  if (size > MAX_TOTAL) throw Error("Attachment limit exceeded");
  return a;
}
function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = props.getProperty("FEEDBACK_SHARED_SECRET");
    if (!expected || expected.length < 32 || !e || !e.postData || !e.postData.contents) return output_({ok:false,error:"Not configured"});
    if (e.postData.contents.length > 12 * 1024 * 1024) return output_({ok:false,error:"Payload too large"});
    const data = JSON.parse(e.postData.contents);
    if (typeof data.secret !== "string" || data.secret !== expected) return output_({ok:false,error:"Unauthorized"});
    const a = valid_(data.submission);
    const folderId = props.getProperty("FEEDBACK_FOLDER_ID");
    const sheetId = props.getProperty("FEEDBACK_SHEET_ID");
    const notify = props.getProperty("FEEDBACK_NOTIFY_EMAIL");
    if (!folderId || !sheetId || !notify) return output_({ok:false,error:"Storage not configured"});
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return output_({ok:false,error:"Busy, retry"});
    try {
      const file = SpreadsheetApp.openById(sheetId);
      const sheet = file.getSheetByName("Feedback") || file.insertSheet("Feedback");
      if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
      const last = sheet.getLastRow();
      if (last > 1) {
        const existing = sheet.getRange(2,1,last-1,1).createTextFinder(a.id).matchEntireCell(true).findNext();
        if (existing) return output_({ok:true,id:a.id,emailNotified:true,duplicate:true});
      }
      const folder = DriveApp.getFolderById(folderId);
      const links = [];
      const created = [];
      try {
        for (let i = 0; i < a.attachments.length; i++) {
          const att = a.attachments[i];
          const bytes = Utilities.base64Decode(att.base64);
          if (bytes.length !== att.size) throw Error("Size mismatch");
          const safe = att.name.replace(/[^a-zA-Z0-9 .()_-]/g,"_").slice(0,120);
          const blob = Utilities.newBlob(bytes, att.mimeType, a.id.slice(0,8) + "-" + (i+1) + "-" + safe);
          const stored = folder.createFile(blob);
          created.push(stored);
          links.push(stored.getUrl());
        }
        sheet.appendRow([a.id,a.createdAt,a.category,safeCell_(a.name),safeCell_(a.email),safeCell_(a.page),safeCell_(a.message),links.length,links.join("\n"),"Pending"]);
      } catch (err) {
        for (const stored of created) {try {stored.setTrashed(true)} catch (_) {}}
        return output_({ok:false,error:"Could not save submission"});
      }
      let emailed = false;
      try {
        const text = [
          "New EvonyMasters feedback",
          "Reference: " + a.id,
          "Category: " + a.category,
          "Player: " + (a.name || "Not provided"),
          "Reply email: " + (a.email || "Not provided"),
          "Page: " + (a.page || "Not provided"),
          "Files (private Drive): " + (links.length ? links.join("\n") : "None"),
          "",
          "Message:",
          a.message
        ].join("\n");
        const opts = {name:"EvonyMasters Feedback"};
        if (a.email) opts.replyTo = a.email;
        MailApp.sendEmail(notify, "EvonyMasters feedback: " + a.category + " (" + a.id.slice(0,8) + ")", text, opts);
        emailed = true;
      } catch (_) { /* The Sheet and Drive records are saved even if Gmail quota/delivery fails. */ }
      sheet.getRange(sheet.getLastRow(),10).setValue(emailed ? "Sent" : "Failed / review Sheet");
      return output_({ok:true,id:a.id,emailNotified:emailed});
    } finally { lock.releaseLock(); }
  } catch (_) { return output_({ok:false,error:"Submission could not be processed"}); }
}
/** Run this once from Apps Script editor (with properties configured) to create/check the Feedback tab. */
function initializeFeedbackSheet() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("FEEDBACK_SHEET_ID");
  const folderId = props.getProperty("FEEDBACK_FOLDER_ID");
  if (!sheetId || !folderId) throw Error("Add FEEDBACK_SHEET_ID and FEEDBACK_FOLDER_ID to Script Properties first");
  DriveApp.getFolderById(folderId).getName();
  const file = SpreadsheetApp.openById(sheetId);
  const sheet = file.getSheetByName("Feedback") || file.insertSheet("Feedback");
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  sheet.setFrozenRows(1);
}

/**
 * Install one daily cleanup trigger. Run once as the script owner.
 * Deletes feedback rows older than 90 days and trashes their uploaded attachments.
 */
function installFeedbackRetention() {
  const fn = "purgeExpiredFeedback";
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === fn).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger(fn).timeBased().everyDays(1).atHour(3).create();
}
function purgeExpiredFeedback() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("FEEDBACK_SHEET_ID");
  if (!sheetId) throw Error("Missing FEEDBACK_SHEET_ID");
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheetByName("Feedback");
  if (!sheet || sheet.getLastRow() < 2) return;
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const rows = sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues();
  for(let i=rows.length-1;i>=0;i--){
    const received = new Date(rows[i][1]).getTime();
    if (!Number.isFinite(received) || received > cutoff) continue;
    const links=String(rows[i][8]||"").split("\n").filter(Boolean);
    // Only delete files inside the configured private feedback folder.
    const folderId=props.getProperty("FEEDBACK_FOLDER_ID");
    for(const link of links){
      const match=link.match(/\/d\/([-\w]{20,})/);
      if(!match)continue;
      try{
        const file=DriveApp.getFileById(match[1]);
        const parents=file.getParents();
        let ours=false;while(parents.hasNext())if(parents.next().getId()===folderId)ours=true;
        if(ours)file.setTrashed(true);
      }catch(_){}
    }
    sheet.deleteRow(i+2);
  }
}
