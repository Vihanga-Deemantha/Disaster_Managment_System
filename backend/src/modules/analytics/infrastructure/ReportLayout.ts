import type { ReportModel } from '../domain/types';

const number = (value: number) => value.toLocaleString('en-US');
const label = (value: unknown) => String(value ?? '').replace(/_/g, ' ');
const escape = (value: string) => value.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
function wrap(value: string, width: number, size: number): string[] {
  const limit = Math.max(1, Math.floor(width / (size * 0.56)));
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let remaining = paragraph;
    while (remaining.length > limit) {
      const space = remaining.lastIndexOf(' ', limit);
      const cut = space > limit / 2 ? space : limit;
      result.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    result.push(remaining);
  }
  return result;
}
const when = (date: string) => date.replace('T', ' ').replace(/:\d{2}(\.\d+)?Z$/, ' UTC');
/** A4 report layout with wrapped cells and repeated table headers on page breaks. */
class ReportLayout {
  private pages: string[] = [];
  private commands: string[] = [];
  private y = 0;
  private text(
    value: string,
    x: number,
    top: number,
    size: number,
    style: { bold?: boolean; color?: string } = {},
  ) {
    this.commands.push(
      `BT /${style.bold ? 'F2' : 'F1'} ${size} Tf ${style.color ?? '0.16 0.22 0.29'} rg 1 0 0 1 ${x} ${top} Tm (${escape(value)}) Tj ET`,
    );
  }
  private rect(x: number, top: number, width: number, height: number, color: string) {
    this.commands.push(`${color} rg ${x} ${top - height} ${width} ${height} re f`);
  }
  private page() {
    if (this.commands.length) this.pages.push(this.commands.join('\n'));
    this.commands = [];
    this.rect(0, 842, 595, 66, '0.06 0.20 0.28');
    this.text('SAFE ZONE', 40, 810, 18, { bold: true, color: '1 1 1' });
    this.text('DISASTER MANAGEMENT | IMPACT & RELIEF', 40, 790, 9, { color: '0.75 0.89 0.91' });
    this.y = 748;
  }
  private paragraph(value: string, size = 9, bold = false) {
    for (const line of wrap(value, 515, size)) {
      if (this.y < 60) this.page();
      this.text(line, 40, this.y, size, { bold });
      this.y -= size + 5;
    }
  }
  private heading(value: string) {
    if (this.y < 110) this.page();
    this.y -= 10;
    this.paragraph(value, 13, true);
    this.y -= 5;
  }
  private table(title: string, headers: string[], widths: number[], rows: string[][]) {
    this.heading(title);
    this.tableHeader(headers, widths);
    if (!rows.length) {
      this.paragraph('No matching records for the selected filters.');
      this.y -= 10;
      return;
    }
    rows.forEach((row, index) => this.tableRow(title, headers, widths, row, index));
    this.y -= 12;
  }
  private tableHeader(headers: string[], widths: number[]) {
    this.rect(40, this.y + 11, 515, 30, '0.06 0.32 0.38');
    let x = 40;
    headers.forEach((h, i) => {
      wrap(h, widths[i]! - 12, 8).forEach((line, n) =>
        this.text(line, x + 6, this.y - n * 10, 8, { bold: true, color: '1 1 1' }),
      );
      x += widths[i]!;
    });
    this.y -= 30;
  }
  private tableRow(
    title: string,
    headers: string[],
    widths: number[],
    row: string[],
    index: number,
  ) {
    const cells = row.map((value, i) => wrap(value, widths[i]! - 12, 8));
    const count = Math.max(...cells.map((cell) => cell.length));
    let offset = 0;
    while (offset < count) {
      if (this.y < 85) {
        this.page();
        this.heading(`${title} (continued)`);
        this.tableHeader(headers, widths);
      }
      const lines = Math.min(count - offset, Math.max(1, Math.floor((this.y - 60) / 11) - 1));
      const height = lines * 11 + 10;
      this.rect(40, this.y + 10, 515, height, index % 2 ? '1 1 1' : '0.94 0.97 0.98');
      let x = 40;
      cells.forEach((cell, i) => {
        cell
          .slice(offset, offset + lines)
          .forEach((line, n) => this.text(line, x + 6, this.y - n * 11, 8));
        x += widths[i]!;
      });
      this.y -= height;
      offset += lines;
    }
  }
  render(model: ReportModel): string[] {
    this.page();
    this.paragraph(model.title, 20, true);
    this.y -= 8;
    this.paragraph(`Reporting period: ${model.filter.from} to ${model.filter.to}`, 11, true);
    this.paragraph(
      `Generated: ${when(model.generatedAt)} | Audience: ${label(model.options.audience)}`,
    );
    this.paragraph(
      `District: ${label(model.filter.district)} | Hazard: ${label(model.filter.hazardType)}`,
    );
    if (model.filter.eventId) this.paragraph(`Event: ${model.filter.eventId}`);
    if (model.filter.organizationId)
      this.paragraph(`Organisation scope: ${model.filter.organizationId}`);
    this.overview(model);
    this.alerts(model);
    this.shelters(model);
    this.dispatches(model);
    this.heading('Report verification');
    this.paragraph(`Report ID: ${model.reportId}`, 8);
    this.paragraph(`Content SHA-256: ${model.contentChecksum}`, 8);
    this.paragraph(
      'The file checksum is available in the download confirmation and export history.',
      8,
    );
    this.pages.push(this.commands.join('\n'));
    return this.pages;
  }
  private overview(model: ReportModel) {
    this.heading('Report overview');
    const alerts = model.sections.alerts;
    if (alerts) {
      const targeted = alerts.reduce((sum, row) => sum + row.targeted, 0);
      const reached = alerts.reduce((sum, row) => sum + row.reached, 0);
      this.paragraph(
        `${number(alerts.length)} alerts | ${number(targeted)} targeted | ${number(reached)} reached | ${targeted ? ((reached / targeted) * 100).toFixed(1) : '0.0'}% reach`,
      );
    }
    const shelters = model.sections.occupancy;
    if (shelters)
      this.paragraph(
        `${number(shelters.length)} shelter observations | Peak recorded occupancy: ${number(shelters.reduce((max, row) => Math.max(max, row.occupancy), 0))}`,
      );
    const dispatches = model.sections.distribution;
    if (dispatches) {
      const units = new Map<string, number>();
      dispatches.forEach((row) => units.set(row.unit, (units.get(row.unit) ?? 0) + row.quantity));
      this.paragraph(
        `${number(dispatches.length)} relief allocations | ${[...units].map(([unit, quantity]) => `${number(quantity)} ${unit}`).join('; ') || 'No supplies recorded'}`,
      );
    }
    this.paragraph(
      'Figures reflect only the selected datasets and authorised scope. Alert reach counts delivery attempts across records, not unique citizens.',
      8,
    );
  }
  private alerts(model: ReportModel) {
    const alerts = model.sections.alerts;
    if (alerts)
      this.table(
        'Alerts & citizen reach',
        ['Date (UTC)', 'District / hazard', 'Targeted', 'Reached', 'Reach %'],
        [110, 150, 85, 85, 85],
        alerts.map((row) => [
          when(row.at),
          `${label(row.district)}\n${label(row.hazardType)}`,
          number(row.targeted),
          number(row.reached),
          `${row.targeted ? ((row.reached / row.targeted) * 100).toFixed(1) : '0.0'}%`,
        ]),
      );
  }
  private shelters(model: ReportModel) {
    const shelters = model.sections.occupancy;
    if (shelters)
      this.table(
        'Shelter capacity & occupancy',
        ['Date (UTC)', 'Shelter / district', 'Occupancy', 'Capacity', 'Utilisation'],
        [110, 170, 75, 75, 85],
        shelters.map((row) => [
          when(row.at),
          `${row.shelterName}\n${label(row.district)}`,
          number(row.occupancy),
          number(row.capacity),
          `${row.capacity ? ((row.occupancy / row.capacity) * 100).toFixed(1) : '0.0'}%`,
        ]),
      );
  }
  private dispatches(model: ReportModel) {
    const dispatches = model.sections.distribution;
    if (dispatches)
      this.table(
        'Relief resource allocations',
        ['Date (UTC)', 'Organisation / district', 'Supply category', 'Quantity', 'Unit'],
        [105, 160, 110, 70, 70],
        dispatches.map((row) => [
          when(row.at),
          `${row.organizationName}\n${label(row.district)}`,
          label(row.supplyCategory),
          number(row.quantity),
          row.unit,
        ]),
      );
  }
}
export function reportPages(model: ReportModel): string[] {
  return new ReportLayout().render(model);
}
