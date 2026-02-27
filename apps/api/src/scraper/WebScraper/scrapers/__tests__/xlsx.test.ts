import { Buffer } from 'buffer';
import * as XLSX from 'xlsx';
import { scrapeWithFetch } from '../fetch';
import { parseSpreadsheetBuffer, isSpreadsheetUrl } from '../xlsx';

jest.mock('undici', () => ({
  request: jest.fn(),
}));

import { request } from 'undici';

describe('xlsx scraper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isSpreadsheetUrl', () => {
    it('should return true for .xlsx URLs', () => {
      expect(isSpreadsheetUrl('https://example.com/file.xlsx')).toBe(true);
      expect(isSpreadsheetUrl('http://example.com/test.xlsx')).toBe(true);
    });

    it('should return true for .xls URLs', () => {
      expect(isSpreadsheetUrl('https://example.com/file.xls')).toBe(true);
    });

    it('should return true for .ods URLs', () => {
      expect(isSpreadsheetUrl('https://example.com/file.ods')).toBe(true);
    });

    it('should return false for non-spreadsheet URLs', () => {
      expect(isSpreadsheetUrl('https://example.com/file.html')).toBe(false);
      expect(isSpreadsheetUrl('https://example.com/file.pdf')).toBe(false);
      expect(isSpreadsheetUrl('https://example.com/file.txt')).toBe(false);
    });
  });

  describe('parseSpreadsheetBuffer', () => {
    it('should return an HTML table with correct header and rows for a simple XLSX buffer', async () => {
      const sheetData = [
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'New York'],
        ['Bob', '25', 'London'],
        ['Charlie', '35', 'Paris'],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await parseSpreadsheetBuffer(buffer);

      expect(result).toContain('<h2>Sheet1</h2>');
      expect(result).toContain('<table>');
      expect(result).toContain('<th>Name</th>');
      expect(result).toContain('<th>Age</th>');
      expect(result).toContain('<th>City</th>');
      expect(result).toContain('<tr><td>Alice</td><td>30</td><td>New York</td></tr>');
      expect(result).toContain('<tr><td>Bob</td><td>25</td><td>London</td></tr>');
      expect(result).toContain('<tr><td>Charlie</td><td>35</td><td>Paris</td></tr>');
    });

    it('should handle multiple sheets', async () => {
      const sheet1Data = [
        ['Header1', 'Header2'],
        ['Data1', 'Data2'],
      ];

      const sheet2Data = [
        ['A', 'B'],
        ['X', 'Y'],
      ];

      const sheet1 = XLSX.utils.aoa_to_sheet(sheet1Data);
      const sheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet1, 'Sheet1');
      XLSX.utils.book_append_sheet(workbook, sheet2, 'Sheet2');

      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await parseSpreadsheetBuffer(buffer);

      expect(result).toContain('<h2>Sheet1</h2>');
      expect(result).toContain('<h2>Sheet2</h2>');
      expect(result).toContain('<th>Header1</th>');
      expect(result).toContain('<th>Header2</th>');
      expect(result).toContain('<td>Data1</td>');
      expect(result).toContain('<th>A</th>');
      expect(result).toContain('<th>B</th>');
    });

    it('should handle empty sheets', async () => {
      const sheet = XLSX.utils.aoa_to_sheet([[]]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await parseSpreadsheetBuffer(buffer);

      expect(result).toContain('<h2>Sheet1</h2>');
      expect(result).toContain('<table>');
      expect(result).toContain('<tr></tr>');
    });

    it('should handle numeric values in cells', async () => {
      const sheetData = [
        ['Value1', 'Value2'],
        [100, 200.5],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      const result = await parseSpreadsheetBuffer(buffer);

      expect(result).toContain('<th>Value1</th>');
      expect(result).toContain('<th>Value2</th>');
      expect(result).toContain('<td>100</td>');
      expect(result).toContain('<td>200.5</td>');
    });
  });

  describe('scrapeWithFetch with spreadsheet URLs', () => {
    it('should call undici request and return parsed content for .xlsx URL', async () => {
      const sheetData = [
        ['Name', 'Value'],
        ['Test', '123'],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      const xlsxBuffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

      (request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: {
          bytes: jest.fn().mockResolvedValue(xlsxBuffer),
        },
      });

      const result = await scrapeWithFetch('https://example.com/file.xlsx');

      expect(request).toHaveBeenCalledWith('https://example.com/file.xlsx', expect.objectContaining({
        method: 'GET',
      }));
      expect(result.content).toContain('<h2>Sheet1</h2>');
      expect(result.content).toContain('<th>Name</th>');
      expect(result.content).toContain('<th>Value</th>');
      expect(result.content).toContain('<td>Test</td>');
      expect(result.content).toContain('<td>123</td>');
    });

    it('should call undici request and return parsed content for .ods URL', async () => {
      const sheetData = [
        ['A', 'B'],
        ['X', 'Y'],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      const odsBuffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'ods' }));

      (request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: {
          bytes: jest.fn().mockResolvedValue(odsBuffer),
        },
      });

      const result = await scrapeWithFetch('https://example.com/file.ods');

      expect(request).toHaveBeenCalledWith('https://example.com/file.ods', expect.objectContaining({
        method: 'GET',
      }));
      expect(result.content).toContain('<th>A</th>');
      expect(result.content).toContain('<td>X</td>');
    });

    it('should return error for HTTP errors on .xlsx URLs', async () => {
      (request as jest.Mock).mockResolvedValue({
        statusCode: 404,
        body: {
          bytes: jest.fn().mockResolvedValue(Buffer.from([])),
        },
      });

      const result = await scrapeWithFetch('https://example.com/file.xlsx');

      expect(result.pageStatusCode).toBe(404);
      expect(result.pageError).toContain('404');
      expect(result.content).toBe('');
    });

    it('should return error for HTTP errors on .ods URLs', async () => {
      (request as jest.Mock).mockResolvedValue({
        statusCode: 500,
        body: {
          bytes: jest.fn().mockResolvedValue(Buffer.from([])),
        },
      });

      const result = await scrapeWithFetch('https://example.com/file.ods');

      expect(result.pageStatusCode).toBe(500);
      expect(result.pageError).toContain('500');
      expect(result.content).toBe('');
    });
  });

  describe('scrapeWithFetch with non-spreadsheet URLs', () => {
    it('should NOT call parseSpreadsheetBuffer for .html URLs', async () => {
      (request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: {
          bytes: jest.fn().mockResolvedValue(Buffer.from('<html></html>')),
        },
      });

      await scrapeWithFetch('https://example.com/file.html');

      expect(request).toHaveBeenCalledWith('https://example.com/file.html', expect.any(Object));
    });

    it('should NOT call parseSpreadsheetBuffer for .pdf URLs', async () => {
      (request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        body: {
          bytes: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
        },
      });

      await scrapeWithFetch('https://example.com/file.pdf');

      expect(request).toHaveBeenCalledWith('https://example.com/file.pdf', expect.any(Object));
    });
  });

  describe('scrapeWithFetch with HTTP errors for regular URLs', () => {
    it('should handle HTTP errors for regular URLs', async () => {
      (request as jest.Mock).mockResolvedValue({
        statusCode: 403,
        body: {
          text: jest.fn().mockResolvedValue('Forbidden'),
        },
      });

      const result = await scrapeWithFetch('https://example.com/page.html');

      expect(result.pageStatusCode).toBe(403);
      expect(result.pageError).toContain('403');
      expect(result.content).toBe('');
    });
  });
});
