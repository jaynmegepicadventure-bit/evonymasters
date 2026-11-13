/**
 * EvonyMasters PUBLIC Q&A export.
 *
 * Add this file alongside Code.gs in the existing Feedback Receiver Apps Script.
 * It uses the existing FEEDBACK_SHEET_ID Script Property.
 *
 * Only rows with Status === "Published" and a non-empty question and answer
 * are returned. No data from the Feedback tab is read or exposed.
 *
 * Deploy a NEW VERSION of the existing web-app deployment after adding this.
 * Do not replace Code.gs or change its doPost() function.
 */

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (params.action !== "qa") {
      return qaJson_({ ok: false, error: "Not found" });
    }

    const spreadsheetId = PropertiesService.getScriptProperties()
      .getProperty("FEEDBACK_SHEET_ID");
    if (!spreadsheetId) {
      return qaJson_({ ok: false, error: "Q&A is not configured" });
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName("Q&A");
    if (!sheet || sheet.getLastRow() < 2) {
      return qaJson_({ ok: true, questions: [] });
    }

    // A:I are the nine Q&A columns; nothing from Feedback is accessed.
    const count = Math.min(sheet.getLastRow() - 1, 5000);
    const values = sheet.getRange(2, 1, count, 9).getDisplayValues();
    const questions = [];
    const usedIds = new Set();

    for (let index = 0; index < values.length; index++) {
      const row = values[index];
      if (String(row[4] || "").trim() !== "Published") continue;

      const question = qaText_(row[2], 400);
      const answer = qaText_(row[3], 6000);
      if (!question || !answer) continue;

      const source = qaText_(row[5], 500);
      const lastUpdated = qaText_(row[6], 100);
      const relatedToolRaw = qaText_(row[7], 300);
      const relatedTool = qaSafeToolLink_(relatedToolRaw);

      // IDs may be manually populated, but are deduplicated to keep stable links.
      const rawId = qaText_(row[0], 100);
      const fallbackId = "qa-row-" + (index + 2);
      const id = /^[A-Za-z0-9_-]{1,100}$/.test(rawId) ? rawId : fallbackId;
      if (usedIds.has(id)) continue;
      usedIds.add(id);

      const order = Number(row[8]);
      questions.push({
        id: id,
        category: qaText_(row[1], 100) || "General",
        question: question,
        answer: answer,
        source: source,
        lastUpdated: lastUpdated,
        relatedTool: relatedTool,
        displayOrder: Number.isFinite(order) && order > 0 ? order : 999999,
        originalRow: index + 2
      });
    }

    questions.sort((a, b) => a.displayOrder - b.displayOrder ||
      a.originalRow - b.originalRow);

    // No internal spreadsheet metadata or editable identifiers are included.
    return qaJson_({
      ok: true,
      questions: questions.slice(0, 500).map(function(q) {
        return {
          id: q.id,
          category: q.category,
          question: q.question,
          answer: q.answer,
          source: q.source,
          lastUpdated: q.lastUpdated,
          relatedTool: q.relatedTool
        };
      })
    });
  } catch (error) {
    // Do not leak spreadsheet IDs, property names or stack traces publicly.
    return qaJson_({ ok: false, error: "Q&A is temporarily unavailable" });
  }
}

function qaText_(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function qaSafeToolLink_(value) {
  if (!value) return "";
  // Only allow local, absolute links within the main EvonyMasters domain.
  if (/^\/(?!\/)[A-Za-z0-9/_-]*\/?(?:#[A-Za-z0-9_-]+)?$/.test(value)) {
    return value;
  }
  const match = value.match(/^https:\/\/www\.evonymasters\.com(\/[^\s?#]*\/?(?:#[A-Za-z0-9_-]+)?)?$/i);
  return match ? (match[1] || "/") : "";
}

function qaJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
