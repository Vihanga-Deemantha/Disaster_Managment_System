import { createHash } from 'node:crypto';
import { ValidationError } from '@shared/errors/DomainError';
import type { ChecksumCalculator, ReportExporter } from '../application/ports';
import type { ReportModel } from '../domain/types';
import { reportPages } from './ReportLayout';

export class Sha256ChecksumCalculator implements ChecksumCalculator {
  calculate(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
/** A2: RFC-style CSV escaping plus spreadsheet formula injection protection. */
export function csvCell(value: unknown): string {
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  if (typeof value !== 'number' && /^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
type FlatRow = Record<string, unknown>;
function flatten(row: FlatRow, prefix = ''): FlatRow {
  return Object.fromEntries(
    Object.entries(row).flatMap(([key, value]) => {
      const field = prefix + key;
      if (Array.isArray(value)) return [[field, value.join('; ')]];
      if (value && typeof value === 'object')
        return Object.entries(flatten(value as FlatRow, field + '.'));
      return [[field, value]];
    }),
  );
}
/** A rectangular UTF-8 spreadsheet: one header, one record per row, no JSON cells. */
export class CsvReportExporter implements ReportExporter {
  async export(model: ReportModel): Promise<Buffer> {
    const metadata = {
      reportId: model.reportId,
      generatedAt: model.generatedAt,
      audience: model.options.audience,
      contentChecksum: model.contentChecksum,
      ...flatten(model.filter as unknown as FlatRow, 'filter.'),
    };
    const records = Object.entries(model.sections).flatMap(([dataset, rows]) =>
      rows.map((row) => ({ dataset, ...flatten(row as unknown as FlatRow), ...metadata })),
    );
    const base = ['dataset', 'id', 'at', 'district', 'hazardType', 'eventId'];
    const keys = [...new Set(records.flatMap((row) => Object.keys(row)))];
    const headers = [
      ...base,
      ...keys.filter((key) => !base.includes(key) && !(key in metadata)).sort(),
      ...Object.keys(metadata),
    ];
    const rows = [
      headers.map(csvCell).join(','),
      ...records.map((row) => headers.map((key) => csvCell((row as FlatRow)[key])).join(',')),
    ];
    return Buffer.from('\uFEFF' + rows.join('\r\n') + '\r\n', 'utf8');
  }
}

/** Small dependency-free PDF adapter. Valid paginated text document, no network PDF service. */
export class PdfWriter {
  write(lines: string[]): Buffer {
    const wrapped = lines.flatMap((line) => line.match(/.{1,95}/g) ?? ['']);
    const pages: string[][] = [];
    for (let i = 0; i < wrapped.length; i += 48) pages.push(wrapped.slice(i, i + 48));
    return this.writePages(
      pages.map((page) =>
        [
          'BT /F1 10 Tf 14 TL 40 800 Td',
          ...page.map(
            (line) => `(${line.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')}) Tj T*`,
          ),
          'ET',
        ].join('\n'),
      ),
    );
  }
  writeReport(model: ReportModel): Buffer {
    return this.writePages(reportPages(model));
  }
  private writePages(pages: string[]): Buffer {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];
    const kids: string[] = [];
    for (const [index, page] of pages.entries()) {
      const pageId = objects.length + 1;
      kids.push(`${pageId} 0 R`);
      const content =
        page + `\nBT /F1 8 Tf 40 24 Td (Safe Zone | Page ${index + 1} of ${pages.length}) Tj ET`;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
      );
    }
    objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`;
    return this.serialize(objects);
  }
  private serialize(objects: string[]): Buffer {
    let document = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => {
      offsets.push(Buffer.byteLength(document));
      document += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const start = Buffer.byteLength(document);
    document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join(
        '',
      )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return Buffer.from(document);
  }
}
export type PdfMode = 'OK' | 'FAIL_ONCE' | 'FAIL_ALWAYS';
export class PdfReportExporter implements ReportExporter {
  private mode: PdfMode = 'OK';
  constructor(private readonly writer: PdfWriter) {}
  setMode(mode: PdfMode): void {
    this.mode = mode;
  }
  async export(model: ReportModel): Promise<Buffer> {
    if (this.mode !== 'OK') {
      if (this.mode === 'FAIL_ONCE') this.mode = 'OK';
      throw new Error('PDF generation unavailable.');
    }
    return this.writer.writeReport(model);
  }
}
/** UCD-16: exactly two exporter strategies. */
export class ReportExporterFactory {
  constructor(
    private readonly pdf: ReportExporter,
    private readonly csv: ReportExporter,
  ) {}
  create(format: string): ReportExporter {
    if (format === 'PDF') return this.pdf;
    if (format === 'CSV') return this.csv;
    throw new ValidationError([
      { code: 'INVALID_FILTER', field: 'format', message: 'Choose PDF or CSV.' },
    ]);
  }
}
