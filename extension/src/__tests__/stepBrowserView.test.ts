import { StepBrowserProvider, GroupingMode } from '../stepBrowserView';
import { StepCache } from '@nokout/big-dill-core';
import { StepDefinition } from '../testController/types';

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

describe('StepBrowserProvider', () => {
    let cache: StepCache;
    let provider: StepBrowserProvider;

    beforeEach(() => {
        cache = new StepCache();
        cache.update([STEP_A, STEP_B, STEP_C]);
        provider = new StepBrowserProvider(cache);
    });

    describe('grouping by file', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByFile));

        test('root children are file path nodes', async () => {
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('state_steps.py');
            expect(labels).toContain('auth_steps.py');
        });

        test('file node children are step items', async () => {
            const roots = await provider.getChildren(undefined);
            const authNode = roots.find(n => n.label === 'auth_steps.py')!;
            const children = await provider.getChildren(authNode);
            expect(children).toHaveLength(2);
        });
    });

    describe('grouping by step type', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByStepType));

        test('root children are param type group nodes', async () => {
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('AustralianState');
        });

        test('steps with no param_types appear under (no type) group', async () => {
            const roots = await provider.getChildren(undefined);
            const noTypeNode = roots.find(n => n.label === '(no type)');
            expect(noTypeNode).toBeDefined();
            const children = await provider.getChildren(noTypeNode!);
            expect(children.length).toBeGreaterThan(0);
        });
    });

    describe('grouping by tag', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByTag));

        test('root children are tag nodes', async () => {
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('@geography');
            expect(labels).toContain('@auth');
        });

        test('steps with no tags appear under (untagged) group', async () => {
            const roots = await provider.getChildren(undefined);
            const untagged = roots.find(n => n.label === '(untagged)');
            expect(untagged).toBeDefined();
        });

        test('step appears in each tag group it belongs to', async () => {
            const roots = await provider.getChildren(undefined);
            const geoNode = roots.find(n => n.label === '@geography')!;
            const children = await provider.getChildren(geoNode);
            const patterns = children.map(c => c.stepDefinition?.pattern);
            expect(patterns).toContain('the state is {state:AustralianState}');
            expect(patterns).toContain('the user logs in');
        });
    });

    describe('empty cache', () => {
        test('returns awaiting placeholder when cache is empty', async () => {
            const emptyCache = new StepCache();
            const emptyProvider = new StepBrowserProvider(emptyCache);
            const roots = await emptyProvider.getChildren(undefined);
            expect(roots).toHaveLength(1);
            expect(roots[0].label).toBe('Awaiting discovery...');
        });
    });

    describe('keyword filter', () => {
        beforeEach(() => provider.setGroupingMode(GroupingMode.ByFile));

        test('setFilter narrows root groups to files containing matching steps', async () => {
            provider.setFilter('state is');
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('state_steps.py');
            expect(labels).not.toContain('auth_steps.py');
        });

        test('filter is case-insensitive', async () => {
            provider.setFilter('STATE IS');
            const roots = await provider.getChildren(undefined);
            expect(roots.map(n => n.label)).toContain('state_steps.py');
        });

        test('filter with no matches returns no-match placeholder', async () => {
            provider.setFilter('xyzzy-nonexistent');
            const roots = await provider.getChildren(undefined);
            expect(roots).toHaveLength(1);
            expect((roots[0].label as string)).toMatch(/No steps match/);
        });

        test('clearing filter restores all steps', async () => {
            provider.setFilter('state is');
            provider.setFilter('');
            const roots = await provider.getChildren(undefined);
            const labels = roots.map(n => n.label);
            expect(labels).toContain('state_steps.py');
            expect(labels).toContain('auth_steps.py');
        });

        test('getFilter returns the current filter text', () => {
            provider.setFilter('hello');
            expect(provider.getFilter()).toBe('hello');
        });
    });
});
