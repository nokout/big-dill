import { GherkinDocument } from '@cucumber/messages';
import {
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
    checkTagAllowlist,
    checkPhrasingRules,
    DiagnosticEntry,
    PhrasingRule,
} from '../featureLinter';
import { parseSource } from '../gherkinParser';

function run(source: string, rule: (doc: GherkinDocument, lines: string[]) => DiagnosticEntry[]) {
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

describe('checkTagAllowlist', () => {
    const featureWithTags = `Feature: F\n  @smoke @regression\n  Scenario: S\n    Given a step`;

    it('returns no diagnostics when allowedTags is empty', () => {
        const { doc } = parseSource(featureWithTags);
        expect(checkTagAllowlist(doc!, featureWithTags.split('\n'), [])).toHaveLength(0);
    });

    it('returns no diagnostics when all tags are allowed', () => {
        const { doc } = parseSource(featureWithTags);
        const diags = checkTagAllowlist(doc!, featureWithTags.split('\n'), ['@smoke', '@regression']);
        expect(diags).toHaveLength(0);
    });

    it('flags tags not in the allowlist', () => {
        const { doc } = parseSource(featureWithTags);
        const diags = checkTagAllowlist(doc!, featureWithTags.split('\n'), ['@smoke']);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/@regression/);
        expect(diags[0].severity).toBe('warning');
    });

    it('checks tags on both feature and scenario', () => {
        const source = `@featuretag\nFeature: F\n  @scenariotag\n  Scenario: S\n    Given a step`;
        const { doc } = parseSource(source);
        const diags = checkTagAllowlist(doc!, source.split('\n'), ['@featuretag']);
        expect(diags.map(d => d.message)).toEqual(expect.arrayContaining([expect.stringContaining('@scenariotag')]));
    });
});

describe('checkPhrasingRules', () => {
    const source = `Feature: F\n  Scenario: S\n    Given the user clicks the button\n    When the form is submitted\n    Then the result should appear`;

    const noActionInGiven: PhrasingRule = {
        pattern: '^the user (click|press|navigate)',
        message: 'Given steps should describe state, not action',
    };

    it('flags a step whose text matches the pattern', () => {
        const { doc } = parseSource(source);
        const diags = checkPhrasingRules(doc!, source.split('\n'), [noActionInGiven]);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toBe('Given steps should describe state, not action');
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag steps that do not match the pattern', () => {
        const { doc } = parseSource(source);
        const diags = checkPhrasingRules(doc!, source.split('\n'), [
            { pattern: '^nonexistent', message: 'nope' },
        ]);
        expect(diags).toHaveLength(0);
    });

    it('returns no diagnostics when phrasingRules is empty', () => {
        const { doc } = parseSource(source);
        expect(checkPhrasingRules(doc!, source.split('\n'), [])).toHaveLength(0);
    });

    it('flags multiple steps when multiple match', () => {
        const multiSource = `Feature: F\n  Scenario: S\n    Given click one\n    Given click two\n    Then done`;
        const { doc } = parseSource(multiSource);
        const diags = checkPhrasingRules(doc!, multiSource.split('\n'), [
            { pattern: '^click', message: 'click not allowed' },
        ]);
        expect(diags).toHaveLength(2);
    });

    it('flags steps in Background blocks', () => {
        const bgSource = `Feature: F\n  Background:\n    Given click setup step\n  Scenario: S\n    Given normal step`;
        const { doc } = parseSource(bgSource);
        const diags = checkPhrasingRules(doc!, bgSource.split('\n'), [
            { pattern: '^click', message: 'click not allowed' },
        ]);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toBe('click not allowed');
    });
});
