import { GherkinDocument } from '@cucumber/messages';
import {
    checkEmptyComments,
    checkDuplicateExampleRows,
    checkOversizedExampleTable,
    checkOutlineMissingExamples,
    checkEmptyExamplesBody,
    checkScenarioShouldBeOutline,
    checkScenarioHasExamplesNotOutline,
    checkTagAllowlist,
    checkPhrasingRules,
    checkUndefinedExampleColumn,
    checkUnusedExampleColumn,
    checkDuplicateScenarioName,
    checkDuplicateExamplesColumn,
    checkEmptyScenario,
    checkOutlineSingleRow,
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

describe('checkScenarioShouldBeOutline', () => {
    it('flags a Scenario whose step contains <param> syntax', () => {
        const source = `Feature: F\n  Scenario: S\n    Given value is <x>`;
        const diags = run(source, checkScenarioShouldBeOutline);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/Scenario Outline/);
        expect(diags[0].severity).toBe('warning');
    });

    it('does not flag a Scenario Outline', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkScenarioShouldBeOutline)).toHaveLength(0);
    });

    it('does not flag a Scenario with no <param> syntax', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a plain step`;
        expect(run(source, checkScenarioShouldBeOutline)).toHaveLength(0);
    });

    it('reports at most one diagnostic per scenario even with multiple params', () => {
        const source = `Feature: F\n  Scenario: S\n    Given <a> and <b>`;
        expect(run(source, checkScenarioShouldBeOutline)).toHaveLength(1);
    });
});

describe('checkScenarioHasExamplesNotOutline', () => {
    it('flags an Examples table under a plain Scenario as error', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step\n    Examples:\n      | x |\n      | 1 |`;
        const diags = run(source, checkScenarioHasExamplesNotOutline);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/Scenario Outline/);
        expect(diags[0].severity).toBe('error');
    });

    it('diagnostic points to the Examples line, not the Scenario line', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step\n    Examples:\n      | x |\n      | 1 |`;
        const diags = run(source, checkScenarioHasExamplesNotOutline);
        // "Examples:" is on line 4 (1-indexed) → 3 (0-indexed)
        expect(diags[0].line).toBe(3);
    });

    it('does not flag a Scenario Outline with Examples', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkScenarioHasExamplesNotOutline)).toHaveLength(0);
    });

    it('does not flag a Scenario with no Examples', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a plain step`;
        expect(run(source, checkScenarioHasExamplesNotOutline)).toHaveLength(0);
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

describe('checkUndefinedExampleColumn', () => {
    it('flags a step referencing a param with no matching Examples column', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <y>\n    Examples:\n      | x |\n      | 1 |`;
        const diags = run(source, checkUndefinedExampleColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/<y>/);
        expect(diags[0].severity).toBe('error');
        // step is on line 3 (1-indexed) → 2 (0-indexed)
        expect(diags[0].line).toBe(2);
    });

    it('does not flag a param that matches an Examples column', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkUndefinedExampleColumn)).toHaveLength(0);
    });

    it('accepts a param defined in any of multiple Examples blocks', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <a> and <b>\n    Examples:\n      | a |\n      | 1 |\n    Examples:\n      | b |\n      | 2 |`;
        expect(run(source, checkUndefinedExampleColumn)).toHaveLength(0);
    });

    it('flags each distinct undefined param in a step', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <a> and <b>\n    Examples:\n      | c |\n      | 1 |`;
        const diags = run(source, checkUndefinedExampleColumn);
        expect(diags.map((d) => d.message)).toEqual([
            expect.stringContaining('<a>'),
            expect.stringContaining('<b>'),
        ]);
    });

    it('reports a repeated undefined param once per step', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <a> and <a>\n    Examples:\n      | c |\n      | 1 |`;
        expect(run(source, checkUndefinedExampleColumn)).toHaveLength(1);
    });

    it('does not flag an outline with no Examples block (covered by another rule)', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <y>`;
        expect(run(source, checkUndefinedExampleColumn)).toHaveLength(0);
    });

    it('does not flag a plain Scenario (covered by another rule)', () => {
        const source = `Feature: F\n  Scenario: S\n    Given value is <y>`;
        expect(run(source, checkUndefinedExampleColumn)).toHaveLength(0);
    });

    it('flags an undefined param in a step datatable cell, on the row line', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given a table:\n      | col   |\n      | <bad> |\n    Examples:\n      | x |\n      | 1 |`;
        const diags = run(source, checkUndefinedExampleColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/<bad>/);
        // offending row is on line 5 (1-indexed) → 4 (0-indexed)
        expect(diags[0].line).toBe(4);
    });

    it('does not flag a datatable cell referencing a defined column', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given a table:\n      | col |\n      | <x> |\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkUndefinedExampleColumn)).toHaveLength(0);
    });

    it('flags an undefined param in a docstring, on the offending content line', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given a doc:\n      """\n      first line\n      value: <bad>\n      """\n    Examples:\n      | x |\n      | 1 |`;
        const diags = run(source, checkUndefinedExampleColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/<bad>/);
        // offending content line is line 6 (1-indexed) → 5 (0-indexed)
        expect(diags[0].line).toBe(5);
    });

    it('flags outlines nested inside a Rule block', () => {
        const source = `Feature: F\n  Rule: R\n    Scenario Outline: S\n      Given value is <y>\n      Examples:\n        | x |\n        | 1 |`;
        const diags = run(source, checkUndefinedExampleColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/<y>/);
    });
});

describe('checkUnusedExampleColumn', () => {
    it('flags a column never referenced by any step, on the header line', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x | y |\n      | 1 | 2 |`;
        const diags = run(source, checkUnusedExampleColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/'y'/);
        expect(diags[0].severity).toBe('warning');
        // header row is on line 5 (1-indexed) → 4 (0-indexed)
        expect(diags[0].line).toBe(4);
    });

    it('does not flag when every column is referenced', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x> and <y>\n    Examples:\n      | x | y |\n      | 1 | 2 |`;
        expect(run(source, checkUnusedExampleColumn)).toHaveLength(0);
    });

    it('counts references in datatables and docstrings', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x> with:\n      """\n      uses <y>\n      """\n    Examples:\n      | x | y |\n      | 1 | 2 |`;
        expect(run(source, checkUnusedExampleColumn)).toHaveLength(0);
    });

    it('does not flag a plain Scenario with Examples (covered by another rule)', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkUnusedExampleColumn)).toHaveLength(0);
    });

    it('does not fire while the outline references an undefined column (that rule owns the typo)', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <missing>\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkUnusedExampleColumn)).toHaveLength(0);
    });

    it('flags unused columns in outlines nested inside a Rule block', () => {
        const source = `Feature: F\n  Rule: R\n    Scenario Outline: S\n      Given value is <x>\n      Examples:\n        | x | y |\n        | 1 | 2 |`;
        const diags = run(source, checkUnusedExampleColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/'y'/);
    });
});

describe('checkDuplicateScenarioName', () => {
    it('flags the second occurrence of a repeated scenario name', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step\n  Scenario: S\n    Given another step`;
        const diags = run(source, checkDuplicateScenarioName);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/'S'/);
        expect(diags[0].severity).toBe('warning');
        // second Scenario is on line 4 (1-indexed) → 3 (0-indexed)
        expect(diags[0].line).toBe(3);
    });

    it('does not flag distinct names', () => {
        const source = `Feature: F\n  Scenario: A\n    Given a step\n  Scenario: B\n    Given a step`;
        expect(run(source, checkDuplicateScenarioName)).toHaveLength(0);
    });

    it('does not flag unnamed scenarios', () => {
        const source = `Feature: F\n  Scenario:\n    Given a step\n  Scenario:\n    Given a step`;
        expect(run(source, checkDuplicateScenarioName)).toHaveLength(0);
    });

    it('detects a collision between a feature-level scenario and one inside a Rule', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step\n  Rule: R\n    Scenario: S\n      Given a step`;
        expect(run(source, checkDuplicateScenarioName)).toHaveLength(1);
    });
});

describe('checkDuplicateExamplesColumn', () => {
    it('flags a header with the same column twice, on the header line', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x | x |\n      | 1 | 2 |`;
        const diags = run(source, checkDuplicateExamplesColumn);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/'x'/);
        expect(diags[0].severity).toBe('error');
        expect(diags[0].line).toBe(4);
    });

    it('does not flag unique columns', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given <x> and <y>\n    Examples:\n      | x | y |\n      | 1 | 2 |`;
        expect(run(source, checkDuplicateExamplesColumn)).toHaveLength(0);
    });

    it('reports a column repeated three times only once', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x | x | x |\n      | 1 | 2 | 3 |`;
        expect(run(source, checkDuplicateExamplesColumn)).toHaveLength(1);
    });
});

describe('checkEmptyScenario', () => {
    it('flags a scenario with no steps', () => {
        const source = `Feature: F\n  Scenario: S\n  Scenario: T\n    Given a step`;
        const diags = run(source, checkEmptyScenario);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/'S'/);
        expect(diags[0].severity).toBe('error');
        expect(diags[0].line).toBe(1);
    });

    it('flags an outline with Examples but no steps', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Examples:\n      | x |\n      | 1 |`;
        expect(run(source, checkEmptyScenario)).toHaveLength(1);
    });

    it('does not flag a scenario with steps', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step`;
        expect(run(source, checkEmptyScenario)).toHaveLength(0);
    });

    it('flags empty scenarios inside a Rule block', () => {
        const source = `Feature: F\n  Rule: R\n    Scenario: S`;
        expect(run(source, checkEmptyScenario)).toHaveLength(1);
    });
});

describe('checkOutlineSingleRow', () => {
    it('flags an outline whose only Examples block has a single data row', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x |\n      | 1 |`;
        const diags = run(source, checkOutlineSingleRow);
        expect(diags).toHaveLength(1);
        expect(diags[0].message).toMatch(/plain Scenario/);
        expect(diags[0].severity).toBe('info');
        expect(diags[0].line).toBe(1);
    });

    it('does not flag an outline with two data rows', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x |\n      | 1 |\n      | 2 |`;
        expect(run(source, checkOutlineSingleRow)).toHaveLength(0);
    });

    it('does not flag an outline with multiple Examples blocks of one row each', () => {
        const source = `Feature: F\n  Scenario Outline: S\n    Given value is <x>\n    Examples:\n      | x |\n      | 1 |\n    Examples:\n      | x |\n      | 2 |`;
        expect(run(source, checkOutlineSingleRow)).toHaveLength(0);
    });

    it('does not flag a plain Scenario', () => {
        const source = `Feature: F\n  Scenario: S\n    Given a step`;
        expect(run(source, checkOutlineSingleRow)).toHaveLength(0);
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
