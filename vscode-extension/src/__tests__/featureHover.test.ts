import { buildHoverContent } from '../featureHover';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const RICH_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [{
        name: 'state',
        type_name: 'AustralianState',
        suggested_values: ['NSW', 'Victoria', 'Queensland'],
        has_validator: true,
    }],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current Australian state.',
    tags: ['geography', 'ui'],
    param_types: ['AustralianState'],
};

const PLAIN_STEP: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 10,
    summary: '',
    tags: [],
    param_types: [],
};

describe('buildHoverContent', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([RICH_STEP, PLAIN_STEP]);
    });

    test('returns null when no step matches', () => {
        expect(buildHoverContent('completely unrelated step', cache)).toBeNull();
    });

    test('includes step pattern in hover', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md).not.toBeNull();
        expect(md!.value).toContain('the state is');
    });

    test('includes docstring summary when present', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md!.value).toContain('Set the current Australian state.');
    });

    test('does not include empty summary section', () => {
        const md = buildHoverContent('the user logs in', cache);
        expect(md!.value).not.toContain('undefined');
    });

    test('includes param type with suggested values', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md!.value).toContain('AustralianState');
        expect(md!.value).toContain('NSW');
        expect(md!.value).toContain('Victoria');
    });

    test('includes tags when present', () => {
        const md = buildHoverContent('the state is NSW', cache);
        expect(md!.value).toContain('geography');
        expect(md!.value).toContain('ui');
    });

    test('does not include tags section when tags is empty', () => {
        const md = buildHoverContent('the user logs in', cache);
        expect(md!.value).not.toContain('Tags');
    });
});
