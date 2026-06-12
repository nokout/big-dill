import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const RICH_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria'],
        has_validator: true,
    }],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current Australian state.',
    tags: ['geography'],
    param_types: ['AustralianState'],
};

const PLAIN_STEP: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 10,
    summary: 'Authenticate the test user.',
    tags: [],
    param_types: [],
};

describe('StepCache enriched metadata', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([RICH_STEP, PLAIN_STEP]);
    });

    test('getAll returns steps with enriched fields intact', () => {
        const all = cache.getAll();
        expect(all[0].file).toBe('/abs/tests/steps/state_steps.py');
        expect(all[0].line).toBe(42);
        expect(all[0].summary).toBe('Set the current Australian state.');
        expect(all[0].tags).toEqual(['geography']);
        expect(all[0].param_types).toEqual(['AustralianState']);
    });

    test('matchPattern returns matching step for exact step text', () => {
        const step = cache.matchPattern('the state is NSW');
        expect(step).not.toBeNull();
        expect(step!.pattern).toBe('the state is {state:AustralianState}');
    });

    test('matchPattern returns null when no match', () => {
        expect(cache.matchPattern('completely unrelated')).toBeNull();
    });

    test('updateUsageCounts sets usage_count on matched steps', () => {
        // Two feature lines reference the state step, one references auth step
        cache.updateUsageCounts([
            'Given the state is NSW',
            'Given the state is Victoria',
            'When the user logs in',
        ]);
        const all = cache.getAll();
        const stateStep = all.find(s => s.pattern === 'the state is {state:AustralianState}')!;
        const loginStep = all.find(s => s.pattern === 'the user logs in')!;
        expect(stateStep.usage_count).toBe(2);
        expect(loginStep.usage_count).toBe(1);
    });

    test('updateUsageCounts resets to 0 for unmatched steps', () => {
        cache.updateUsageCounts([]);
        const all = cache.getAll();
        expect(all.every(s => s.usage_count === 0)).toBe(true);
    });
});
