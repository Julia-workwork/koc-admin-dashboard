const SHEET_NAME = '2026 KOC';

function doGet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return jsonOutput({ error: `Sheet not found: ${SHEET_NAME}` });
  }

  const range = sheet.getDataRange();
  const values = range.getDisplayValues();

  return jsonOutput({
    sheetName: SHEET_NAME,
    updatedAt: new Date().toISOString(),
    values,
  });
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
