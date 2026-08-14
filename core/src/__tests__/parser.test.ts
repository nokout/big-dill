import { parseSource, GherkinParseCache } from '../gherkin/parser';
import type { CacheableDocument } from '../gherkin/parser';

const VALID = `Feature: F
  Scenario: S
    Given a step`;

const WITH_DATATABLE = `Feature: F
  Scenario: S
    Given data
      | key   | value |
      | hello | world |`;

describe('parseSource', () => {
    it('returns a GherkinDocument for valid input', () => {
        const { doc, errors } = parseSource(VALID);
        expect(doc).not.toBeNull();
        expect(doc?.feature?.name).toBe('F');
        expect(errors).toHaveLength(0);
    });

    it('returns errors without throwing for malformed input', () => {
        expect(() => parseSource('not gherkin {{{')).not.toThrow();
        const { errors } = parseSource('not gherkin {{{');
        expect(errors.length).toBeGreaterThan(0);
    });

    it('includes datatable rows in the AST', () => {
        const { doc } = parseSource(WITH_DATATABLE);
        const step = doc?.feature?.children[0]?.scenario?.steps[0];
        expect(step?.dataTable?.rows).toHaveLength(2);
    });
});

describe('GherkinParseCache', () => {
    it('returns the same result object on the second call with same version', () => {
        const cache = new GherkinParseCache();
        const doc = { uri: { fsPath: '/a.feature' }, version: 1, getText: () => VALID } satisfies CacheableDocument;
        expect(cache.parse(doc)).toBe(cache.parse(doc));
    });

    it('re-parses when version number changes', () => {
        const cache = new GherkinParseCache();
        const v1 = { uri: { fsPath: '/a.feature' }, version: 1, getText: () => VALID } satisfies CacheableDocument;
        const v2 = { uri: { fsPath: '/a.feature' }, version: 2, getText: () => VALID } satisfies CacheableDocument;
        expect(cache.parse(v1)).not.toBe(cache.parse(v2));
    });
});
