import {
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
} from '../featureLinter';
import { parseSource } from '../gherkinParser';

function run(source: string, rule: (doc: any, lines: string[]) => any[]) {
    const { doc } = parseSource(source);
    return doc ? rule(doc, source.split('\n')) : [];
}

describe('checkEmptyComments', () => {
    it('flags a line that is only #', () => {
        const diags = run(`Feature: F\n  #\n  Scenario: S\n    Given a step`, checkEmptyComments);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/empty comment/i);
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag a comment with content', () => {
        expect(run(`Feature: F\n  # valid\n  Scenario: S\n    Given a step`, checkEmptyComments)).toHaveLength(0);
    });
});

describe('checkDuplicateExampleRows', () => {
    it('flags duplicate rows in the same Examples block', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |\n      | 1 |`;
        const diags = run(source, checkDuplicateExampleRows);
        expect(diags).toHaveLength(1);
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag unique rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |\n      | 2 |`;
        expect(run(source, checkDuplicateExampleRows)).toHaveLength(0);
    });
});

describe('checkOversizedExampleTable', () => {
    it('flags an Examples block exceeding 20 rows', () => {
        const rows = Array.from({ length: 21 }, (_, i) => `      | ${i} |`).join('\n');
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n${rows}`;
        expect(run(source, checkOversizedExampleTable)).toHaveLength(1);
    });

    it('does not flag a table with exactly 20 rows', () => {
        const rows = Array.from({ length: 20 }, (_, i) => `      | ${i} |`).join('\n');
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n${rows}`;
        expect(run(source, checkOversizedExampleTable)).toHaveLength(0);
    });
});

describe('checkOutlineMissingExamples', () => {
    it('flags a Scenario Outline with no Examples block', () => {
        const diags = run(`Feature: F\n  Scenario Outline: S\n    Given <x>`, checkOutlineMissingExamples);
        expect(diags).toHaveLength(1);
        expect(diags[0].severity).toBe('error');
    });

    it('does not flag an outline with Examples', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkOutlineMissingExamples)).toHaveLength(0);
    });
});

describe('checkEmptyExamplesBody', () => {
    it('flags an Examples block with header but no data rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |`;
        const diags = run(source, checkEmptyExamplesBody);
        expect(diags).toHaveLength(1);
        expect(diags[0].severity).toBe('error');
    });

    it('does not flag Examples with data rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkEmptyExamplesBody)).toHaveLength(0);
    });
});
