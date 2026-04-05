import { buildPrompt, normalizeResult, extractJson } from '../lib/analysis-utils';

describe('normalizeResult', () => {
  it('maps a valid kpis array', () => {
    const raw = {
      dashboardTitle: 'Sales Q1',
      executiveSummary: 'Revenue up.',
      kpis: [
        { label: 'Revenue', value: '$2.4M', trend: 1, context: 'vs last Q' },
        { label: 'Orders',  value: 340,     trend: 0, context: 'total' },
      ],
      charts: [],
      insights: ['Insight one'],
      recommendations: ['Do this'],
      alerts: [],
    };
    const result = normalizeResult(raw);
    expect(result.dashboardTitle).toBe('Sales Q1');
    expect(result.kpis).toHaveLength(2);
    expect(result.kpis[0].label).toBe('Revenue');
    expect(result.kpis[0].trend).toBe(1);
    expect(result.kpis[1].value).toBe(340);
  });

  it('returns empty kpis array when kpis is missing', () => {
    const result = normalizeResult({ executiveSummary: 'ok' });
    expect(result.kpis).toEqual([]);
  });

  it('caps kpis at 8', () => {
    const raw = {
      kpis: Array.from({ length: 12 }, (_, i) => ({
        label: `KPI ${i}`, value: i, trend: 0, context: '',
      })),
    };
    expect(normalizeResult(raw).kpis).toHaveLength(8);
  });

  it('defaults missing trend to 0', () => {
    const raw = { kpis: [{ label: 'X', value: 1, context: '' }] };
    expect(normalizeResult(raw).kpis[0].trend).toBe(0);
  });

  it('falls back gracefully when kpis is an object (old format)', () => {
    const raw = { kpis: { rejectionRate: { value: 4 } } };
    expect(normalizeResult(raw).kpis).toEqual([]);
  });
});

describe('buildPrompt', () => {
  it('contains the free-array kpis schema', () => {
    const prompt = buildPrompt([{ sheetName: 'Sheet1', totalRows: 5, columns: [] }]);
    expect(prompt).toContain('"kpis": [');
    expect(prompt).toContain('"label"');
    expect(prompt).toContain('"trend"');
  });

  it('does not contain hardcoded manufacturing field names', () => {
    const prompt = buildPrompt([]);
    expect(prompt).not.toContain('rejectionRate');
    expect(prompt).not.toContain('totalOutput');
    expect(prompt).not.toContain('qualityScore');
  });

  it('truncates data at 12000 chars', () => {
    const bigData = Array.from({ length: 1000 }, (_, i) => ({ col: `value_${i}` }));
    const prompt = buildPrompt(bigData);
    expect(prompt.length).toBeLessThan(15000);
  });
});

describe('extractJson', () => {
  it('parses raw JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside markdown fences', () => {
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('extracts JSON from surrounding text', () => {
    expect(extractJson('Here is the result: {"a":3} done')).toEqual({ a: 3 });
  });

  it('throws on invalid JSON', () => {
    expect(() => extractJson('not json')).toThrow();
  });
});
