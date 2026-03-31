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
        // insertText is a SnippetString — check its value property
        expect((items[0].insertText as { value: string }).value).toBe('the state is ${1:state}');
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
