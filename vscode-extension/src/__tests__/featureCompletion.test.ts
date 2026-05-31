import { buildStepCompletions, buildDomainCompletions, extractStepText } from '../featureCompletion';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const STATE_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria', 'Queensland'],
        has_validator: true,
    }],
};

const PLAIN_STEP: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
};

describe('extractStepText', () => {
    test('strips Given keyword and returns remainder', () => {
        expect(extractStepText('Given the state is NSW')).toEqual({ keyword: 'given', text: 'the state is NSW' });
    });

    test('strips When keyword', () => {
        expect(extractStepText('  When something happens')).toEqual({ keyword: 'when', text: 'something happens' });
    });

    test('returns null for non-step lines', () => {
        expect(extractStepText('Feature: My Feature')).toBeNull();
        expect(extractStepText('')).toBeNull();
    });

    test('handles And and But', () => {
        expect(extractStepText('And something')).toEqual({ keyword: 'and', text: 'something' });
        expect(extractStepText('But not that')).toEqual({ keyword: 'but', text: 'not that' });
    });
});

describe('buildStepCompletions', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STATE_STEP, PLAIN_STEP]);
    });

    test('returns snippet completion for step with parameter', () => {
        const items = buildStepCompletions('', 'given', cache);
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe('the state is {state:AustralianState}');
        // parameter has suggested_values → choice snippet, not plain placeholder
        expect((items[0].insertText as { value: string }).value).toBe('the state is ${1|NSW,Victoria,Queensland|}');
    });

    test('filters by partial text', () => {
        const items = buildStepCompletions('the state', 'given', cache);
        expect(items).toHaveLength(1);
    });

    test('returns empty when partial text does not match', () => {
        expect(buildStepCompletions('nonexistent', 'given', cache)).toHaveLength(0);
    });

    test('plain step has non-snippet insertText', () => {
        const items = buildStepCompletions('', 'when', cache);
        expect(items).toHaveLength(1);
        expect(items[0].insertText).toBe('the user logs in');
    });
});

describe('buildDomainCompletions', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STATE_STEP]);
    });

    test('returns domain values when cursor is inside param placeholder', () => {
        // Full step text, cursor after "the state is " (col 13)
        const items = buildDomainCompletions('the state is ', 13, cache);
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
    });

    test('returns domain values when cursor is inside a partially-typed value', () => {
        const items = buildDomainCompletions('the state is NS', 15, cache);
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
    });

    test('returns empty when cursor is not in a param position', () => {
        expect(buildDomainCompletions('unrelated text', 5, cache)).toHaveLength(0);
    });
});

describe('buildStepCompletions usage-frequency ranking', () => {
    test('returns steps sorted by usage_count descending', () => {
        const cache = new StepCache();
        const low: StepDefinition = { keyword: 'given', pattern: 'the alpha step', parameters: [], usage_count: 1 };
        const high: StepDefinition = { keyword: 'given', pattern: 'the beta step', parameters: [], usage_count: 5 };
        const zero: StepDefinition = { keyword: 'given', pattern: 'the gamma step', parameters: [], usage_count: 0 };
        cache.update([low, high, zero]);
        const items = buildStepCompletions('the', 'given', cache);
        expect(items[0].label).toBe('the beta step');
        expect(items[1].label).toBe('the alpha step');
        expect(items[2].label).toBe('the gamma step');
    });

    test('sortText property is set on each completion item', () => {
        const cache = new StepCache();
        cache.update([{ keyword: 'given', pattern: 'a step', parameters: [], usage_count: 3 }]);
        const items = buildStepCompletions('', 'given', cache);
        expect(items[0].sortText).toBeDefined();
    });

    test('parameter with suggested_values uses snippet choice syntax', () => {
        const cache = new StepCache();
        const step: StepDefinition = {
            keyword: 'given', pattern: 'the state is {state:AustralianState}',
            parameters: [{ name: 'state', type_name: 'AustralianState', suggested_values: ['NSW', 'VIC'], has_validator: false }],
        };
        cache.update([step]);
        const items = buildStepCompletions('', 'given', cache);
        const insertText = items[0].insertText as import('vscode').SnippetString;
        expect(insertText.value).toBe('the state is ${1|NSW,VIC|}');
    });

    test('parameter without suggested_values falls back to plain placeholder', () => {
        const cache = new StepCache();
        const step: StepDefinition = {
            keyword: 'given', pattern: 'the value is {n}',
            parameters: [{ name: 'n', type_name: '', suggested_values: [], has_validator: false }],
        };
        cache.update([step]);
        const items = buildStepCompletions('', 'given', cache);
        const insertText = items[0].insertText as import('vscode').SnippetString;
        expect(insertText.value).toBe('the value is ${1:n}');
    });
});
