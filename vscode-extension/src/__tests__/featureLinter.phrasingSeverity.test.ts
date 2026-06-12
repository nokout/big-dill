import { graduatePhrasingSeverity } from '../featureLinter';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const IMPLEMENTED_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
};

describe('graduatePhrasingSeverity', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([IMPLEMENTED_STEP]);
    });

    test('returns Warning when step text is unimplemented', () => {
        const sev = graduatePhrasingSeverity('a new unimplemented step here', cache);
        expect(sev).toBe('warning');
    });

    test('returns Information when step text is implemented', () => {
        const sev = graduatePhrasingSeverity('the state is NSW', cache);
        expect(sev).toBe('information');
    });
});
