import { formatTables, TextEditEntry } from '../featureFormatter';
import { parseSource } from '../gherkinParser';

function format(source: string): TextEditEntry[] {
    const { doc } = parseSource(source);
    return doc ? formatTables(doc, source.split('\n')) : [];
}

function apply(source: string, edits: TextEditEntry[]): string {
    const lines = source.split('\n');
    const sorted = [...edits].sort((a, b) => b.startLine - a.startLine);
    for (const edit of sorted) {
        lines.splice(edit.startLine, 1, edit.newText);
    }
    return lines.join('\n');
}

const UNALIGNED_DATATABLE = `Feature: F
  Scenario: S
    Given data
      | key | value |
      | hello | world |`;

const UNALIGNED_EXAMPLES = `Feature: F
  Scenario Outline: S
    Given <n>
    Examples:
      | n | label |
      | 1 | alpha |
      | 10 | beta |`;

const NUMERIC_EXAMPLES = `Feature: F
  Scenario Outline: S
    Given <n>
    Examples:
      | label | count |
      | alpha | 1     |
      | beta  | 200   |`;

describe('formatTables — datatables', () => {
    it('left-aligns all columns to max width', () => {
        const result = apply(UNALIGNED_DATATABLE, format(UNALIGNED_DATATABLE));
        expect(result).toContain('| key   | value |');
        expect(result).toContain('| hello | world |');
    });

    it('does not produce edits for non-table lines', () => {
        const edits = format(UNALIGNED_DATATABLE);
        expect(edits.every(e => {
            const line = UNALIGNED_DATATABLE.split('\n')[e.startLine];
            return line.trim().startsWith('|');
        })).toBe(true);
    });
});

describe('formatTables — examples tables', () => {
    it('aligns columns across header and body', () => {
        const result = apply(UNALIGNED_EXAMPLES, format(UNALIGNED_EXAMPLES));
        expect(result).toContain('| n  | label |');
        expect(result).toContain('|  1 | alpha |');
        expect(result).toContain('| 10 | beta  |');
    });

    it('right-aligns pure-numeric columns', () => {
        const result = apply(NUMERIC_EXAMPLES, format(NUMERIC_EXAMPLES));
        expect(result).toContain('|     1 |');
        expect(result).toContain('|   200 |');
    });

    it('left-aligns the header of a numeric column', () => {
        const result = apply(NUMERIC_EXAMPLES, format(NUMERIC_EXAMPLES));
        // header "count" left-aligned in its column width
        expect(result).toContain('| count |');
    });
});

describe('formatTables — edge cases', () => {
    it('returns no edits when the file is already correctly formatted', () => {
        const source = `Feature: F\n  Scenario: S\n    Given data\n      | key   | value |\n      | hello | world |`;
        expect(format(source)).toHaveLength(0);
    });
});
