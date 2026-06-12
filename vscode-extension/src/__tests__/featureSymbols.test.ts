import { buildSymbols } from '../featureSymbols';
import { parseSource } from '../gherkinParser';

function symbols(source: string) {
    const { doc } = parseSource(source);
    return doc ? buildSymbols(doc) : [];
}

const SIMPLE = `Feature: Login
  Scenario: Valid login
    Given a user
  Scenario: Invalid login
    Given a bad user`;

const WITH_OUTLINE = `Feature: Search
  Scenario Outline: Search by <term>
    Given term <term>
    Examples:
      | term |
      | foo  |`;

const WITH_TAGS = `Feature: Tagged
  @smoke
  Scenario: Tagged scenario
    Given a step`;

describe('buildSymbols', () => {
    it('returns one top-level symbol for the Feature', () => {
        expect(symbols(SIMPLE)).toHaveLength(1);
        expect(symbols(SIMPLE)[0].name).toBe('Login');
    });

    it('returns Scenario children under the Feature', () => {
        const children = symbols(SIMPLE)[0].children;
        expect(children).toHaveLength(2);
        expect(children[0].name).toBe('Valid login');
        expect(children[1].name).toBe('Invalid login');
    });

    it('includes Scenario Outline as a child', () => {
        const children = symbols(WITH_OUTLINE)[0].children;
        expect(children[0].name).toBe('Search by <term>');
    });

    it('includes tag in detail when present', () => {
        const children = symbols(WITH_TAGS)[0].children;
        expect(children[0].detail).toContain('@smoke');
    });

    it('returns empty array when doc has no feature', () => {
        expect(symbols('')).toHaveLength(0);
    });
});
