import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { FORM_FIELD_TYPE_LABELS, formatFormValue, formFieldPoints, type FormFieldDto, type FormSectionDto, type FormSubmissionDto } from '@upstart/back-office/shared';

/** Download submissions: one as a PDF or Excel file, or many as an analysis workbook (Answers, Results, Questions). */

const tableLineColor: [number, number, number] = [243, 243, 243];
const tableHeadStyles = { fillColor: [124, 58, 237] as [number, number, number], textColor: 255, lineColor: tableLineColor };
const tableCellStyles = { lineColor: tableLineColor, lineWidth: 0.4 };

function fileBase(s: FormSubmissionDto): string {
  const who = s.submitterOrganization ?? s.submitterName ?? s.submitterEmail ?? 'submission';
  return `${s.formName} ${who} ${s.createdAt.slice(0, 10)}`
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function submittedAt(s: FormSubmissionDto): string {
  return new Date(s.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function band(s: FormSubmissionDto) {
  return s.scores?.bandId ? s.bands.find((b) => b.id === s.scores!.bandId) ?? null : null;
}

const round = (n: number) => Math.round(n);

export function exportSubmissionPdf(s: FormSubmissionDto): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const margin = 40;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > bottom) {
      pdf.addPage();
      y = margin;
    }
  };
  const text = (t: string, size: number, bold = false, gap = 4) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    for (const line of pdf.splitTextToSize(t, width) as string[]) {
      ensure(size + gap);
      pdf.text(line, margin, y);
      y += size + gap;
    }
  };

  text(s.formName, 18, true);
  y += 4;
  const who = [s.submitterName, s.submitterOrganization, s.submitterEmail, s.submitterPhone].filter(Boolean).join(', ');
  if (who) text(who, 11);
  text(`Submitted ${submittedAt(s)}${s.versionNumber ? `, version ${s.versionNumber}` : ''}`, 11);
  y += 12;

  const sc = s.scores;
  if (sc) {
    const b = band(s);
    text('Results', 14, true);
    text(`Total score: ${sc.total} of ${sc.max} points (${round(sc.percent)}%)`, 11, true);
    if (b) {
      text(`Profile: ${b.label}`, 11, true);
      if (b.description) text(b.description, 10);
      if (b.nextSteps.length) {
        y += 4;
        text('Next steps', 10, true);
        for (const step of b.nextSteps) text(`- ${step}`, 10);
      }
    }
    if (sc.groups.length) {
      y += 6;
      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Area', 'Points', 'Score']],
        body: sc.groups.map((g) => [g.name, `${g.score} of ${g.max}`, `${round(g.percent)}%`]),
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, ...tableCellStyles },
        headStyles: tableHeadStyles,
        columnStyles: { 1: { cellWidth: 80 }, 2: { cellWidth: 60 } },
      });
      y = finalY(pdf) + 18;
    }
  }

  for (const sec of s.sections) {
    if (!sec.fields.length) continue;
    ensure(40);
    text(sec.name, 13, true);
    const scored = sec.fields.some((f) => formFieldPoints(f, null) !== null);
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [scored ? ['Question', 'Answer', 'Points'] : ['Question', 'Answer']],
      body: sec.fields.map((f) => {
        const row = [f.name, formatFormValue(f, s.values[f.id]) || 'No answer'];
        if (scored) {
          const p = formFieldPoints(f, s.values[f.id]);
          row.push(p === null ? '' : String(p));
        }
        return row;
      }),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4, ...tableCellStyles },
      headStyles: tableHeadStyles,
      columnStyles: scored ? { 0: { cellWidth: width * 0.45 }, 2: { cellWidth: 50 } } : { 0: { cellWidth: width * 0.45 } },
    });
    y = finalY(pdf) + 18;
  }

  pdf.save(`${fileBase(s)}.pdf`);
}

export function exportSubmissionExcel(s: FormSubmissionDto): void {
  const rows: (string | number)[][] = [['Section', 'Question', 'Answer', 'Points']];
  const add = (section: string, question: string, answer: string | number, points: string | number = '') => rows.push([section, question, answer, points]);

  add('Submitted by', 'Name', s.submitterName ?? '');
  add('Submitted by', 'Organization', s.submitterOrganization ?? '');
  add('Submitted by', 'Email', s.submitterEmail ?? '');
  add('Submitted by', 'Phone', s.submitterPhone ?? '');
  add('Submitted by', 'Submitted', submittedAt(s));

  const sc = s.scores;
  if (sc) {
    add('Results', 'Total score', `${round(sc.percent)}%`, `${sc.total} of ${sc.max}`);
    add('Results', 'Profile', band(s)?.label ?? '');
    for (const g of sc.groups) add('Results', g.name, `${round(g.percent)}%`, `${g.score} of ${g.max}`);
  }

  for (const sec of s.sections) {
    for (const f of sec.fields) {
      const p = formFieldPoints(f, s.values[f.id]);
      add(sec.name, f.name, formatFormValue(f, s.values[f.id]), p ?? '');
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 22 }, { wch: 50 }, { wch: 50 }, { wch: 12 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Submission');
  XLSX.writeFile(book, `${fileBase(s)}.xlsx`);
}

/** The form as it is now: question order (for codes) and score areas. */
export type ExportFormShape = { sections: FormSectionDto[]; scoring: { enabled: boolean; groups: { id: string; name: string }[] } };

/**
 * Submissions for analysis outside UBO, one workbook:
 * - Answers: one row per answer (who sent it, status, the question by code, the answer; on scored forms its
 *   points and its question's score area).
 * - Results (scored forms): one row per submission with the total score, profile and area scores.
 * - Questions: the key. Codes (Q1, Q2…) follow the current form order; questions only in earlier versions come after.
 */
export function exportSubmissionsExcel(
  formName: string,
  form: ExportFormShape,
  list: FormSubmissionDto[],
  statusLabel: (s: FormSubmissionDto) => string,
  filenameBase: string,
): void {
  // Questions: the current form first, then any only earlier versions had (newest version first).
  type Q = { code: string; field: FormFieldDto; section: string; current: boolean };
  const questions: Q[] = [];
  const byId = new Map<string, Q>();
  const addQ = (field: FormFieldDto, section: string, current: boolean) => {
    if (byId.has(field.id)) return;
    const q = { code: `Q${questions.length + 1}`, field, section, current };
    questions.push(q);
    byId.set(field.id, q);
  };
  for (const sec of form.sections) for (const f of sec.fields) addQ(f, sec.name, true);
  const newestFirst = [...list].sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0) || b.createdAt.localeCompare(a.createdAt));
  for (const s of newestFirst) for (const sec of s.sections) for (const f of sec.fields) addQ(f, sec.name, false);

  // Score areas: the current form's, then any only earlier versions had.
  const areas: { id: string; name: string }[] = [...form.scoring.groups];
  for (const s of newestFirst) for (const g of s.scores?.groups ?? []) if (!areas.some((a) => a.id === g.id)) areas.push({ id: g.id, name: g.name });
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const scored = form.scoring.enabled || list.some((s) => s.scores);

  const who = (s: FormSubmissionDto): Cell[] => [new Date(s.createdAt), statusLabel(s), s.submitterName ?? '', s.submitterOrganization ?? '', s.submitterEmail ?? '', s.submitterPhone ?? '', s.versionNumber ?? ''];
  const whoHead = ['Submitted', 'Status', 'Name', 'Organization', 'Email', 'Phone', 'Version'];
  const areaHead = areas.flatMap((a) => [`${a.name} points`, `${a.name} %`]);
  const areaCells = (s: FormSubmissionDto): Cell[] =>
    areas.flatMap((a): Cell[] => {
      const g = s.scores?.groups.find((x) => x.id === a.id);
      return g ? [g.score, round(g.percent)] : ['', ''];
    });

  // Answers
  const answerHead = [...whoHead, 'Section', 'Question code', 'Question', 'Answer'];
  if (scored) answerHead.push('Points', 'Score area');
  const answers: Cell[][] = [answerHead];
  for (const s of list) {
    const base = who(s);
    for (const sec of s.sections) {
      for (const f of sec.fields) {
        const q = byId.get(f.id)!;
        const value = s.values[f.id];
        const row: Cell[] = [...base, sec.name, q.code, f.name, formatFormValue(f, value)];
        if (scored) {
          const p = formFieldPoints(f, value);
          row.push(p ?? '', f.scoreGroupId ? areaName.get(f.scoreGroupId) ?? '' : '');
        }
        answers.push(row);
      }
    }
  }

  const book = XLSX.utils.book_new();
  const sheetOpts = { dateNF: 'yyyy-mm-dd hh:mm' };
  const answersSheet = XLSX.utils.aoa_to_sheet(answers, sheetOpts);
  answersSheet['!cols'] = answerHead.map((h) => ({ wch: colWidth(h) }));
  withFilter(answersSheet, answers);
  XLSX.utils.book_append_sheet(book, answersSheet, 'Answers');

  // Results
  if (scored) {
    const resultHead = [...whoHead, 'Total points', 'Max points', 'Total score %', 'Profile', ...areaHead];
    const results: Cell[][] = [resultHead];
    for (const s of list) {
      const sc = s.scores;
      results.push([...who(s), sc?.total ?? '', sc?.max ?? '', sc ? round(sc.percent) : '', band(s)?.label ?? '', ...areaCells(s)]);
    }
    const resultsSheet = XLSX.utils.aoa_to_sheet(results, sheetOpts);
    resultsSheet['!cols'] = resultHead.map((h) => ({ wch: colWidth(h) }));
    withFilter(resultsSheet, results);
    XLSX.utils.book_append_sheet(book, resultsSheet, 'Results');
  }

  // Questions
  const qHead = ['Question code', 'Section', 'Question', 'Type', 'Required', 'On current form'];
  if (scored) qHead.push('Score area');
  qHead.push('Choices');
  const qRows: Cell[][] = [qHead];
  for (const q of questions) {
    const f = q.field;
    const row: Cell[] = [q.code, q.section, f.name, FORM_FIELD_TYPE_LABELS[f.type], f.required ? 'Yes' : 'No', q.current ? 'Yes' : 'No'];
    if (scored) row.push(f.scoreGroupId ? areaName.get(f.scoreGroupId) ?? '' : '');
    row.push(
      f.options
        .map((o) => (typeof o.points === 'number' ? `${o.label} (${o.points} ${o.points === 1 ? 'point' : 'points'})` : o.label))
        .join('; '),
    );
    qRows.push(row);
  }
  const qSheet = XLSX.utils.aoa_to_sheet(qRows);
  qSheet['!cols'] = qHead.map((h) => ({ wch: h === 'Question' || h === 'Choices' ? 60 : colWidth(h) }));
  withFilter(qSheet, qRows);
  XLSX.utils.book_append_sheet(book, qSheet, 'Questions');

  XLSX.writeFile(book, `${filenameBase}.xlsx`);
}

type Cell = string | number | Date;

function colWidth(header: string): number {
  if (header === 'Question' || header === 'Answer') return 50;
  return Math.min(30, Math.max(12, header.length + 2));
}

function withFilter(sheet: XLSX.WorkSheet, rows: Cell[][]): void {
  const cols = rows[0]?.length ?? 0;
  if (!cols) return;
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: cols - 1 } }) };
}

function finalY(pdf: jsPDF): number {
  return (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
}
