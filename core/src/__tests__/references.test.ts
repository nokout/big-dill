import { findReferencesInLines } from '../steps/references';
import { StepDefinition } from '../protocol/types';

const STEP: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: '',
    tags: [],
    param_types: [],
};

describe('findReferencesInLines', () => {
    test('returns line numbers where step pattern matches', () => {
        const lines = [
            'Feature: States',
            '  Scenario: Basic',
            '    Given the state is NSW',
            '    When the user logs in',
            '    Given the state is Victoria',
        ];
        const matches = findReferencesInLines(lines, STEP);
        expect(matches).toHaveLength(2);
        expect(matches[0]).toBe(2);
        expect(matches[1]).toBe(4);
    });

    test('returns empty array when no lines match', () => {
        const lines = ['When the user logs in', 'Then it succeeds'];
        expect(findReferencesInLines(lines, STEP)).toHaveLength(0);
    });

    test('ignores comment lines starting with #', () => {
        const lines = ['# Given the state is NSW'];
        expect(findReferencesInLines(lines, STEP)).toHaveLength(0);
    });
});
