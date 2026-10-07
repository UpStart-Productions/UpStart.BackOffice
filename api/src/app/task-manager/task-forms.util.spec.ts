import { describe, expect, it } from 'vitest';
import { buildSubmission, normalizeQuestions, slugify } from './task-forms.util';

const fields = [
  { id: 'f1', name: 'Priority', type: 'SINGLE_SELECT', options: [{ id: 'o1', label: 'High' }, { id: 'o2', label: 'Low' }] },
  { id: 'f2', name: 'Effort', type: 'NUMBER', options: [] },
];

describe('task forms', () => {
  it('slugifies', () => {
    expect(slugify('GrovLink Bugs!')).toBe('grovlink-bugs');
    expect(slugify('***')).toBe('form');
  });

  it('normalizes questions', () => {
    const qs = normalizeQuestions(
      [
        { label: 'Summary', target: 'NAME', type: 'LONG_TEXT', required: true },
        { label: 'Severity', target: 'FIELD', fieldId: 'f1' },
        { label: 'Steps', type: 'LONG_TEXT' },
        { label: 'Steps', type: 'SELECT', options: ['A', ' ', 'A', 'B'] },
        { label: 'Screenshot', type: 'FILE', target: 'NAME' },
      ].slice(0, 4),
      fields,
    );
    expect(qs[0]).toMatchObject({ key: 'summary', type: 'SHORT_TEXT', target: 'NAME', required: true });
    expect(qs[1]).toMatchObject({ type: 'SELECT', options: ['High', 'Low'], fieldId: 'f1' });
    expect(qs[2].key).toBe('steps');
    expect(qs[3]).toMatchObject({ key: 'steps_2', options: ['A', 'B'] });
    expect(() => normalizeQuestions([{ label: 'x' }], fields)).toThrow(/exactly one/);
    expect(() => normalizeQuestions([{ label: 'x', target: 'NAME' }, { label: 'y', target: 'FIELD', fieldId: 'nope' }], fields)).toThrow(/no longer exists/);
  });

  it('builds a submission', () => {
    const qs = normalizeQuestions(
      [
        { label: 'Summary', target: 'NAME', required: true },
        { label: 'Severity', target: 'FIELD', fieldId: 'f1', required: true },
        { label: 'Steps <to> reproduce', type: 'LONG_TEXT' },
        { label: 'Screenshot', type: 'FILE', required: true },
      ],
      fields,
    );
    const s = buildSubmission(qs, { summary: 'Login broken', severity: 'high', steps_to_reproduce: 'a\nb' }, fields, {
      fileCount: 1,
      formName: 'Bugs',
      submitter: { name: 'Pat', email: 'pat@x.com' },
      context: { appVersion: '2.1.0' },
    });
    expect(s.name).toBe('Login broken');
    expect(s.fieldValues).toEqual([{ fieldId: 'f1', value: 'o1' }]);
    expect(s.descriptionHtml).toContain('<strong>Steps &lt;to&gt; reproduce</strong><br>a<br>b');
    expect(s.descriptionHtml).toContain('appVersion');
    expect(s.descriptionHtml).toContain('Pat &lt;pat@x.com&gt;');
    expect(() => buildSubmission(qs, { severity: 'nope' }, fields, { formName: 'Bugs' })).toThrow(/Summary.*required.*isn't one of the choices.*needs a file/);
  });
});
