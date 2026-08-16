import { buildDefinitionLocation } from '../featureDefinition';
import { StepCache } from '@nokout/big-dill-core';
import { StepDefinition } from '../testController/types';

const STEP_WITH_LOCATION: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: '',
    tags: [],
    param_types: [],
};

const STEP_NO_LOCATION: StepDefinition = {
    keyword: 'when',
    pattern: 'no location step',
    parameters: [],
    // file and line intentionally absent
};

describe('buildDefinitionLocation', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STEP_WITH_LOCATION, STEP_NO_LOCATION]);
    });

    test('returns Location for step with file and line', () => {
        const loc = buildDefinitionLocation('the state is NSW', cache);
        expect(loc).not.toBeNull();
        expect((loc!.uri as { fsPath: string }).fsPath).toBe('/abs/tests/steps/state_steps.py');
    });

    test('returns null when step has no file metadata', () => {
        expect(buildDefinitionLocation('no location step', cache)).toBeNull();
    });

    test('returns null when no step matches', () => {
        expect(buildDefinitionLocation('completely unknown step', cache)).toBeNull();
    });
});
