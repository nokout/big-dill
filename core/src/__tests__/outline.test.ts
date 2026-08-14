import { buildSymbolTree } from '../symbols/outline';
import { parseSource } from '../gherkin/parser';

function outline(source: string) {
    const { doc } = parseSource(source);
    return buildSymbolTree(doc!);
}

describe('buildSymbolTree', () => {
    it('returns the feature with its scenarios beneath it', () => {
        const [feature] = outline(`Feature: Login
  Scenario: Sign in
    Given I am on the page
  Scenario: Sign out
    Given I am signed in
`);
        expect(feature).toMatchObject({ name: 'Login', kind: 'feature', line: 0, detail: '' });
        expect(feature.children.map((c) => c.name)).toEqual(['Sign in', 'Sign out']);
        expect(feature.children.every((c) => c.kind === 'scenario')).toBe(true);
    });

    it('reports zero-based line numbers', () => {
        const [feature] = outline(`Feature: F

  Scenario: S
    Given x
`);
        expect(feature.line).toBe(0);
        expect(feature.children[0].line).toBe(2);
    });

    it('puts tags in the detail field, space separated with their @', () => {
        const [feature] = outline(`Feature: F
  @smoke @fast
  Scenario: S
    Given x
`);
        expect(feature.children[0].detail).toBe('@smoke @fast');
    });

    it('leaves detail empty when a scenario has no tags', () => {
        const [feature] = outline(`Feature: F
  Scenario: S
    Given x
`);
        expect(feature.children[0].detail).toBe('');
    });

    it('includes a background, labelling an unnamed one', () => {
        const [feature] = outline(`Feature: F
  Background:
    Given a thing
  Scenario: S
    Given x
`);
        expect(feature.children.map((c) => c.name)).toEqual(['(background)', 'S']);
    });

    it('names unnamed features and scenarios', () => {
        const [feature] = outline(`Feature:
  Scenario:
    Given x
`);
        expect(feature.name).toBe('(unnamed feature)');
        expect(feature.children[0].name).toBe('(unnamed scenario)');
    });

    it('includes scenario outlines alongside plain scenarios', () => {
        const [feature] = outline(`Feature: F
  Scenario Outline: Templated
    Given <x>
    Examples:
      | x |
      | 1 |
`);
        expect(feature.children.map((c) => c.name)).toEqual(['Templated']);
    });

    it('returns nothing for a document with no feature', () => {
        expect(buildSymbolTree({} as never)).toEqual([]);
    });
});
