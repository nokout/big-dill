import { buildTableTokens } from '../tokens/semanticTokens';
import { parseSource } from '../gherkin/parser';

function tokenize(source: string) {
    const { doc } = parseSource(source);
    return doc ? buildTableTokens(doc, source.split('\n')) : [];
}

const DATATABLE = `Feature: F
  Scenario: S
    Given data
      | key   | value   |
      | hello | "world" |`;

const EXAMPLES = `Feature: F
  Scenario Outline: S
    Given <key>
    Examples:
      | key     | count |
      | "alpha" | 1     |`;

describe('datatables', () => {
    it('emits gherkinDatatablePipe for each | character', () => {
        // 2 rows × 3 pipes = 6
        expect(tokenize(DATATABLE).filter(t => t.tokenType === 'gherkinDatatablePipe')).toHaveLength(6);
    });

    it('emits gherkinDatatableCell for unquoted values', () => {
        // key, value, hello = 3
        expect(tokenize(DATATABLE).filter(t => t.tokenType === 'gherkinDatatableCell')).toHaveLength(3);
    });

    it('emits gherkinDatatableCellString for quoted values', () => {
        // "world" = 1
        expect(tokenize(DATATABLE).filter(t => t.tokenType === 'gherkinDatatableCellString')).toHaveLength(1);
    });
});

describe('examples tables', () => {
    it('emits gherkinExamplesHeaderCell for header row', () => {
        // key, count = 2
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesHeaderCell')).toHaveLength(2);
    });

    it('emits gherkinExamplesCell for unquoted body cells', () => {
        // 1 = 1
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesCell')).toHaveLength(1);
    });

    it('emits gherkinExamplesCellString for quoted body cells', () => {
        // "alpha" = 1
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesCellString')).toHaveLength(1);
    });

    it('emits gherkinExamplesPipe for | characters in examples', () => {
        // 2 rows × 3 pipes = 6
        expect(tokenize(EXAMPLES).filter(t => t.tokenType === 'gherkinExamplesPipe')).toHaveLength(6);
    });
});

describe('pipe positions are derived from source line scan', () => {
    it('locates first pipe at the correct column on an aligned table', () => {
        // Line: "      | key     | value   |"
        //        0123456  → pipe at col 6
        const source = `Feature: F\n  Scenario: S\n    Given d\n      | key     | value   |\n      | hello   | world   |`;
        const pipes = tokenize(source).filter(t => t.tokenType === 'gherkinDatatablePipe');
        const firstRowPipes = pipes.filter(t => t.line === 3);
        expect(firstRowPipes[0].startChar).toBe(6);
    });
});
