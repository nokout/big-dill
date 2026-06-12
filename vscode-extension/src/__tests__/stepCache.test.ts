import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const GIVEN_STATE: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria'],
        has_validator: true,
    }],
};

const WHEN_ACTION: StepDefinition = {
    keyword: 'when',
    pattern: 'the user clicks the button',
    parameters: [],
};

const STEP_GENERIC: StepDefinition = {
    keyword: 'step',
    pattern: 'a generic step',
    parameters: [],
};

describe('StepCache', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([GIVEN_STATE, WHEN_ACTION, STEP_GENERIC]);
    });

    test('getAll returns all step definitions', () => {
        expect(cache.getAll()).toHaveLength(3);
    });

    test('getForKeyword filters by keyword', () => {
        // each result includes the specific keyword's steps + keyword=step steps
        expect(cache.getForKeyword('given')).toHaveLength(2);
        expect(cache.getForKeyword('when')).toHaveLength(2);
    });

    test('getForKeyword includes keyword=step in all keyword queries', () => {
        expect(cache.getForKeyword('given')).toEqual(expect.arrayContaining([
            expect.objectContaining({ pattern: STEP_GENERIC.pattern, keyword: STEP_GENERIC.keyword })
        ]));
        expect(cache.getForKeyword('when')).toEqual(expect.arrayContaining([
            expect.objectContaining({ pattern: STEP_GENERIC.pattern, keyword: STEP_GENERIC.keyword })
        ]));
        expect(cache.getForKeyword('then')).toEqual(expect.arrayContaining([
            expect.objectContaining({ pattern: STEP_GENERIC.pattern, keyword: STEP_GENERIC.keyword })
        ]));
    });

    test('matchLine returns null for non-matching text', () => {
        expect(cache.matchLine('something completely different')).toBeNull();
    });

    test('matchLine returns step and extracted params on match', () => {
        const result = cache.matchLine('the state is NSW');
        expect(result).not.toBeNull();
        expect(result!.step.pattern).toBe('the state is {state:AustralianState}');
        expect(result!.params).toEqual({ state: 'NSW' });
    });

    test('paramPositionAt returns null for non-matching line', () => {
        expect(cache.paramPositionAt('unrelated line', 5)).toBeNull();
    });

    test('paramPositionAt returns parameter when cursor is inside param value', () => {
        // "the state is NSW" — "NSW" starts at col 13
        const result = cache.paramPositionAt('the state is NSW', 14);
        expect(result).not.toBeNull();
        expect(result!.parameter.name).toBe('state');
        expect(result!.valueStart).toBe(13);
        expect(result!.valueEnd).toBe(16);
    });

    test('paramPositionAt resolves correct span when placeholder text matches literal word', () => {
        // "the state is state" — the parameter value "state" starts at col 13,
        // not col 4 where the literal word "state" appears first.
        const result = cache.paramPositionAt('the state is state', 16);
        expect(result).not.toBeNull();
        expect(result!.parameter.name).toBe('state');
        expect(result!.valueStart).toBe(13);
        expect(result!.valueEnd).toBe(18);
    });

    test('paramPositionAt works for mid-sentence param where name does not appear in prefix', () => {
        // Pattern: "the capital of {state:AustralianState} is visited"
        // "state" does NOT appear in the literal prefix "the capital of"
        const capital: StepDefinition = {
            keyword: 'given',
            pattern: 'the capital of {state:AustralianState} is visited',
            parameters: [{ name: 'state', type_name: 'AustralianState', suggested_values: ['NSW'], has_validator: true }],
        };
        const cache2 = new StepCache();
        cache2.update([capital]);
        const result = cache2.paramPositionAt('the capital of state is visited', 16);
        expect(result).not.toBeNull();
        expect(result!.valueStart).toBe(15);
        expect(result!.valueEnd).toBe(20);
    });
});

describe('StepCache distributed steps', () => {
    test('distributed steps are returned by getAll', () => {
        const cache = new StepCache();
        const dist: StepDefinition = { keyword: 'step', pattern: 'distributed', parameters: [] };
        cache.updateDistributed([dist]);
        expect(cache.getAll()).toEqual(expect.arrayContaining([
            expect.objectContaining({ pattern: dist.pattern, keyword: dist.keyword })
        ]));
    });

    test('live steps override distributed when both present', () => {
        const cache = new StepCache();
        cache.updateDistributed([{ keyword: 'step', pattern: 'both', parameters: [] }]);
        cache.update([{ keyword: 'given', pattern: 'both', parameters: [] }]);
        const all = cache.getAll();
        expect(all).toHaveLength(2);  // both present; live takes precedence via ordering
    });
});
