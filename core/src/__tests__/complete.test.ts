import {
    completeStepPatterns,
    completeParameterValues,
    completeAt,
    extractStepText,
} from '../completion/complete';
import { StepCache } from '../steps/stepCache';
import { StepDefinition } from '../protocol/types';

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

describe('completeStepPatterns', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STATE_STEP, PLAIN_STEP]);
    });

    test('returns snippet completion for step with parameter', () => {
        const items = completeStepPatterns('', 'given', cache);
        expect(items).toHaveLength(1);
        // label is normalized (type annotation stripped)
        expect(items[0].label).toBe('the state is {state}');
        // parameter has suggested_values → choice snippet, not plain placeholder
        expect(items[0].insertText).toBe('the state is ${1|NSW,Victoria,Queensland|}');
    });

    test('filters by partial text', () => {
        const items = completeStepPatterns('the state', 'given', cache);
        expect(items).toHaveLength(1);
    });

    test('returns empty when partial text does not match', () => {
        expect(completeStepPatterns('nonexistent', 'given', cache)).toHaveLength(0);
    });

    test('matches when partial text contains a typed value in a param position', () => {
        const items = completeStepPatterns('the state is NSW', 'given', cache);
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe('the state is {state}');
    });

    test('matches when partial text contains a partial value in a param position', () => {
        const items = completeStepPatterns('the state is NS', 'given', cache);
        expect(items).toHaveLength(1);
        expect(items[0].label).toBe('the state is {state}');
    });

    test('does not match unrelated text even if it starts with the same word', () => {
        expect(completeStepPatterns('the state of', 'given', cache)).toHaveLength(0);
    });

    test('plain step has non-snippet insertText', () => {
        const items = completeStepPatterns('', 'when', cache);
        expect(items).toHaveLength(1);
        expect(items[0].insertText).toBe('the user logs in');
    });
});

describe('completeParameterValues', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STATE_STEP]);
    });

    test('returns domain values when cursor is inside param placeholder', () => {
        // Full step text, cursor after "the state is " (col 13)
        const items = completeParameterValues('the state is ', 13, cache);
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
    });

    test('returns domain values when cursor is inside a partially-typed value', () => {
        const items = completeParameterValues('the state is NS', 15, cache);
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
    });

    test('returns empty when cursor is not in a param position', () => {
        expect(completeParameterValues('unrelated text', 5, cache)).toHaveLength(0);
    });
});

describe('completeStepPatterns usage-frequency ranking', () => {
    test('returns steps sorted by usage_count descending', () => {
        const cache = new StepCache();
        const low: StepDefinition = { keyword: 'given', pattern: 'the alpha step', parameters: [], usage_count: 1 };
        const high: StepDefinition = { keyword: 'given', pattern: 'the beta step', parameters: [], usage_count: 5 };
        const zero: StepDefinition = { keyword: 'given', pattern: 'the gamma step', parameters: [], usage_count: 0 };
        cache.update([low, high, zero]);
        const items = completeStepPatterns('the', 'given', cache);
        expect(items[0].label).toBe('the beta step');
        expect(items[1].label).toBe('the alpha step');
        expect(items[2].label).toBe('the gamma step');
    });

    test('sortText property is set on each completion item', () => {
        const cache = new StepCache();
        cache.update([{ keyword: 'given', pattern: 'a step', parameters: [], usage_count: 3 }]);
        const items = completeStepPatterns('', 'given', cache);
        expect(items[0].sortText).toBeDefined();
    });

    test('parameter with suggested_values uses snippet choice syntax', () => {
        const cache = new StepCache();
        const step: StepDefinition = {
            keyword: 'given', pattern: 'the state is {state:AustralianState}',
            parameters: [{ name: 'state', type_name: 'AustralianState', suggested_values: ['NSW', 'VIC'], has_validator: false }],
        };
        cache.update([step]);
        const items = completeStepPatterns('', 'given', cache);
        expect(items[0].snippet).toBe(true);
        expect(items[0].insertText).toBe('the state is ${1|NSW,VIC|}');
    });

    test('parameter without suggested_values falls back to plain placeholder', () => {
        const cache = new StepCache();
        const step: StepDefinition = {
            keyword: 'given', pattern: 'the value is {n}',
            parameters: [{ name: 'n', type_name: '', suggested_values: [], has_validator: false }],
        };
        cache.update([step]);
        const items = completeStepPatterns('', 'given', cache);
        expect(items[0].snippet).toBe(true);
        expect(items[0].insertText).toBe('the value is ${1:n}');
    });
});

describe('completeAt', () => {
    function cacheWith(steps: StepDefinition[]): StepCache {
        const cache = new StepCache();
        cache.update(steps);
        return cache;
    }

    test('returns all step patterns when nothing typed after keyword', () => {
        const line = '  Given ';
        const items = completeAt(line, line.length, cacheWith([STATE_STEP, PLAIN_STEP]));
        // STATE_STEP is the only given-keyword step; label is normalized
        expect(items.map((i) => i.label)).toEqual(['the state is {state}']);
    });

    test('returns domain values when cursor is right after parameter separator', () => {
        const line = 'Given the state is ';
        const items = completeAt(line, line.length, cacheWith([STATE_STEP]));
        expect(items.map((i) => i.label)).toEqual(['NSW', 'Victoria', 'Queensland']);
        expect(items.every((i) => i.kind === 'value')).toBe(true);
    });

    test('returns nothing for a line that is not a step', () => {
        expect(completeAt('  Scenario: something', 20, cacheWith([STATE_STEP]))).toEqual([]);
    });
});
