import * as XLSX from 'xlsx';
import { Logger } from "../../../lib/logger";

export function isSpreadsheetUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.ods');
}

export async function parseSpreadsheetBuffer(buffer: Buffer): Promise<string> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook) {
      Logger.debug(`⛏️ xlsx: No workbook returned`);
      return '';
    }
    const sheets = workbook.SheetNames;
    const content: string[] = [];

    for (const sheetName of sheets) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        Logger.debug(`⛏️ xlsx: No sheet data for ${sheetName}`);
        continue;
      }
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
      const headerRow = '<tr>' + (rows[0] || []).map(c => '<th>' + String(c) + '</th>').join('') + '</tr>';
      const bodyRows = rows.slice(1).map(r => '<tr>' + r.map(c => '<td>' + String(c) + '</td>').join('') + '</tr>').join('');
      const table = '<table>' + headerRow + bodyRows + '</table>';
      content.push('<h2>' + sheetName + '</h2>' + table);
    }

    Logger.debug(`⛏️ xlsx: Parsed ${sheets.length} sheets, ${content.length} total chars`);
    return content.join('\n');
  } catch (error) {
    Logger.debug(`⛏️ xlsx: Parse error: ${(error as Error).message}`);
    return '';
  }
}
