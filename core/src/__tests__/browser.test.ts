import { browseSteps, type GroupingMode, type StepBrowserNode } from '../steps/browser';
import type { StepDefinition } from '../protocol/types';

const STEP_A: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state:AustralianState}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current state.',
    tags: ['geography'],
    param_types: ['AustralianState'],
};

const STEP_B: StepDefinition = {
    keyword: 'when',
    pattern: 'the user logs in',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 10,
    summary: 'Authenticate the user.',
    tags: ['auth', 'geography'],
    param_types: [],
};

const STEP_C: StepDefinition = {
    keyword: 'then',
    pattern: 'the result is shown',
    parameters: [],
    file: '/abs/tests/steps/auth_steps.py',
    line: 20,
    summary: 'Verify the result.',
    tags: [],
    param_types: [],
};

describe('browseSteps', () => {
    const ALL = [STEP_A, STEP_B, STEP_C];
    const labels = (mode: GroupingMode, group?: string, filter?: string): string[] =>
        browseSteps(ALL, { mode, filter, group }).map((n) => n.label);

    describe('grouping by file', () => {
        test('root rows are file basenames', () => {
            expect(labels('file')).toEqual(['auth_steps.py', 'state_steps.py']);
        });

        test('a file group lists the steps defined in it', () => {
            expect(labels('file', 'auth_steps.py')).toHaveLength(2);
        });

        test('a step with no file falls under the unknown-file group', () => {
            const orphan = { ...STEP_C, file: undefined };
            expect(browseSteps([orphan], { mode: 'file' }).map((n) => n.label))
                .toEqual(['(unknown file)']);
        });
    });

    describe('grouping by step type', () => {
        test('root rows are parameter type names', () => {
            expect(labels('stepType')).toContain('AustralianState');
        });

        test('steps without param types fall under (no type)', () => {
            expect(labels('stepType')).toContain('(no type)');
            expect(labels('stepType', '(no type)').length).toBeGreaterThan(0);
        });
    });

    describe('grouping by tag', () => {
        test('root rows are tags, prefixed with @', () => {
            expect(labels('tag')).toEqual(['(untagged)', '@auth', '@geography']);
        });

        test('a step appears under every tag it carries', () => {
            expect(labels('tag', '@geography')).toEqual([
                'the state is {state:AustralianState}',
                'the user logs in',
            ]);
        });

        test('untagged steps fall under (untagged)', () => {
            expect(labels('tag', '(untagged)')).toEqual(['the result is shown']);
        });
    });

    describe('ordering', () => {
        test('groups are sorted, and steps within a group sorted by pattern', () => {
            expect(labels('file')).toEqual([...labels('file')].sort());
            expect(labels('file', 'auth_steps.py')).toEqual([...labels('file', 'auth_steps.py')].sort());
        });
    });

    describe('filtering', () => {
        test('narrows groups to those containing a match', () => {
            const shown = labels('file', undefined, 'state is');
            expect(shown).toContain('state_steps.py');
            expect(shown).not.toContain('auth_steps.py');
        });

        test('is case-insensitive and trimmed', () => {
            expect(labels('file', undefined, '  STATE IS  ')).toContain('state_steps.py');
        });

        test('an empty filter shows everything', () => {
            expect(labels('file', undefined, '')).toEqual(['auth_steps.py', 'state_steps.py']);
        });

        test('no matches yields a single message row', () => {
            const rows = browseSteps(ALL, { mode: 'file', filter: 'xyzzy-nonexistent' });
            expect(rows).toEqual([{ kind: 'message', label: 'No steps match "xyzzy-nonexistent"' }]);
        });
    });

    describe('empty cache', () => {
        test('root shows the awaiting-discovery message', () => {
            expect(browseSteps([], { mode: 'file' }))
                .toEqual([{ kind: 'message', label: 'Awaiting discovery...' }]);
        });

        test('an expanded group shows nothing rather than a message', () => {
            expect(browseSteps([], { mode: 'file', group: 'anything' })).toEqual([]);
        });
    });

    describe('node kinds', () => {
        test('groups carry no step, steps carry their definition', () => {
            const [group] = browseSteps(ALL, { mode: 'file' });
            expect(group.kind).toBe('group');
            const [step] = browseSteps(ALL, { mode: 'file', group: 'state_steps.py' });
            expect(step).toMatchObject({ kind: 'step', step: { pattern: STEP_A.pattern } });
        });
    });
});
