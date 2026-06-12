import { findUnimplementedSteps } from '../featureDiagnostics';
import { StepCache } from '../stepCache';
import { StepDefinition } from '../testController/types';

const KNOWN_STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
};

describe('findUnimplementedSteps', () => {
    let cache: StepCache;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([KNOWN_STEP]);
    });

    test('returns empty array when all steps are implemented', () => {
        const lines = [
            'Feature: Test',
            '  Scenario: Basic',
            '    Given the state is NSW',
        ];
        expect(findUnimplementedSteps(lines, cache)).toHaveLength(0);
    });

    test('flags unmatched step with line number and text', () => {
        const lines = [
            'Feature: Test',
            '  Scenario: Basic',
            '    Given the unknown step here',
        ];
        const results = findUnimplementedSteps(lines, cache);
        expect(results).toHaveLength(1);
        expect(results[0].lineIndex).toBe(2);
        expect(results[0].stepText).toBe('the unknown step here');
    });

    test('ignores non-step lines', () => {
        const lines = [
            'Feature: Test',
            '  Scenario: Something',
            '  Background:',
            '    # comment',
        ];
        expect(findUnimplementedSteps(lines, cache)).toHaveLength(0);
    });

    test('flags multiple unimplemented steps', () => {
        const lines = [
            '    Given step one unknown',
            '    When step two unknown',
            '    Given the state is NSW',
        ];
        const results = findUnimplementedSteps(lines, cache);
        expect(results).toHaveLength(2);
        expect(results[0].lineIndex).toBe(0);
        expect(results[1].lineIndex).toBe(1);
    });
});
