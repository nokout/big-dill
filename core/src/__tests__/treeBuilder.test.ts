// Tree-shape tests, run with no editor and no mock.
//
// These mirror the characterisation tests written against the VS Code adapter
// before the logic was extracted; they assert the same behaviour on the plain
// nodes this package produces. The adapter keeps a smaller suite covering
// materialisation.

import { buildTestTree, type TreeNode } from '../tree/builder';
import type { DiscoveredTestNode } from '../protocol/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function bddLeaf(over: Record<string, unknown> = {}): any {
    return {
        path: '/repo/tests/test_features.py',
        name: 'test_a_passing_scenario',
        type_: 'test',
        id_: 'tests/test_features.py::test_a_passing_scenario',
        lineno: 12,
        runID: 'run-1',
        feature_path: 'features/states/basic_states.feature',
        scenario_name: 'A passing scenario',
        ...over,
    };
}

function tree(...children: any[]): DiscoveredTestNode {
    return { path: '/repo', name: 'repo', type_: 'folder', id_: 'root', children } as any;
}

function find(nodes: TreeNode[], id: string): TreeNode | undefined {
    for (const n of nodes) {
        if (n.id === id) return n;
        const nested = find(n.children, id);
        if (nested) return nested;
    }
    return undefined;
}

const byId = (nodes: TreeNode[], id: string) => nodes.find((n) => n.id === id);

describe('buildTestTree — BDD items', () => {
    it('nests feature files under folders derived from feature_path', () => {
        const { roots } = buildTestTree(tree(bddLeaf()));
        const features = byId(roots, 'features')!;
        expect(features.label).toBe('Features 🗂');
        const states = byId(features.children, 'states')!;
        expect(states.label).toBe('States 🗂');
        expect(byId(states.children, 'features/states/basic_states.feature')).toBeDefined();
    });

    it('labels the feature file from feature_name, falling back to a sentence-cased stem', () => {
        const named = buildTestTree(tree(bddLeaf({ feature_name: 'Basic test states' })));
        expect(find(named.roots, 'features/states/basic_states.feature')!.label).toBe('Basic test states 🗒');
        const plain = buildTestTree(tree(bddLeaf()));
        expect(find(plain.roots, 'features/states/basic_states.feature')!.label).toBe('Basic states 🗒');
    });

    it('keys scenarios as featurePath::scenarioName, falling back to name', () => {
        const withName = buildTestTree(tree(bddLeaf()));
        expect(find(withName.roots, 'features/states/basic_states.feature::A passing scenario')!.label)
            .toBe('A passing scenario');
        const without = buildTestTree(tree(bddLeaf({ scenario_name: undefined })));
        expect(find(without.roots, 'features/states/basic_states.feature::test_a_passing_scenario'))
            .toBeDefined();
    });

    it('gives a scenario both feature and scenario tags, described by its own', () => {
        const { roots } = buildTestTree(tree(bddLeaf({
            feature_tags: ['smoke'],
            scenario_tags: ['passes', 'fast'],
        })));
        const scenario = find(roots, 'features/states/basic_states.feature::A passing scenario')!;
        expect(scenario.tags).toEqual(['smoke', 'passes', 'fast']);
        expect(scenario.description).toBe('@passes @fast');
        const file = find(roots, 'features/states/basic_states.feature')!;
        expect(file.tags).toEqual(['smoke']);
        expect(file.description).toBe('@smoke');
    });

    it('omits description when there are no tags', () => {
        const { roots } = buildTestTree(tree(bddLeaf()));
        expect(find(roots, 'features/states/basic_states.feature')!.description).toBeUndefined();
    });

    it('converts lineno to a zero-based range, accepting strings', () => {
        for (const lineno of [12, '12']) {
            const { roots } = buildTestTree(tree(bddLeaf({ lineno })));
            expect(find(roots, 'features/states/basic_states.feature::A passing scenario')!.range)
                .toEqual({ start: { line: 11, character: 0 }, end: { line: 12, character: 0 } });
        }
    });

    it('omits the range when lineno is zero, negative or unparseable', () => {
        for (const lineno of [0, -1, 'nonsense']) {
            const { roots } = buildTestTree(tree(bddLeaf({ lineno })));
            expect(find(roots, 'features/states/basic_states.feature::A passing scenario')!.range)
                .toBeUndefined();
        }
    });

    it('groups sibling scenarios under one feature file node', () => {
        const { roots } = buildTestTree(tree(
            bddLeaf({ scenario_name: 'First', runID: 'r1' }),
            bddLeaf({ scenario_name: 'Second', runID: 'r2' }),
        ));
        const file = find(roots, 'features/states/basic_states.feature')!;
        expect(file.children.map((c) => c.label).sort()).toEqual(['First', 'Second']);
    });

    it('maps every leaf id to its pytest run id', () => {
        const { idToRunId } = buildTestTree(tree(bddLeaf({ runID: 'run-xyz' })));
        expect(idToRunId.get('features/states/basic_states.feature::A passing scenario')).toBe('run-xyz');
        expect(idToRunId.size).toBe(1);
    });

    it('keeps same-named folders separate when they have different parents', () => {
        const { roots } = buildTestTree(tree(
            bddLeaf({ feature_path: 'a/shared/one.feature', scenario_name: 'S1', runID: 'r1' }),
            bddLeaf({ feature_path: 'b/shared/two.feature', scenario_name: 'S2', runID: 'r2' }),
        ));
        const sharedA = byId(byId(roots, 'a')!.children, 'shared')!;
        const sharedB = byId(byId(roots, 'b')!.children, 'shared')!;
        expect(byId(sharedA.children, 'a/shared/one.feature')).toBeDefined();
        expect(byId(sharedB.children, 'b/shared/two.feature')).toBeDefined();
        expect(byId(sharedA.children, 'b/shared/two.feature')).toBeUndefined();
    });

    // Pinned quirk: a folder carries only its own segment, so a host joining it
    // to the cwd gets <cwd>/<segment> rather than the folder's true path.
    it('gives folders their segment only, and files the full feature path', () => {
        const { roots } = buildTestTree(tree(bddLeaf()));
        expect(byId(roots, 'features')!.uri).toEqual({ path: 'features' });
        expect(byId(byId(roots, 'features')!.children, 'states')!.uri).toEqual({ path: 'states' });
        expect(find(roots, 'features/states/basic_states.feature')!.uri)
            .toEqual({ path: 'features/states/basic_states.feature' });
    });

    it('places a root-level feature file with no directory parts', () => {
        const { roots } = buildTestTree(tree(bddLeaf({ feature_path: 'top.feature', scenario_name: 'S' })));
        expect(byId(roots, 'top.feature')).toBeDefined();
        expect(find(roots, 'top.feature::S')).toBeDefined();
    });
});

describe('buildTestTree — non-BDD items', () => {
    const plain = (over: Record<string, unknown> = {}): any => ({
        path: '/repo/tests/test_plain.py',
        name: 'test_one',
        type_: 'test',
        id_: 'tests/test_plain.py::test_one',
        lineno: 5,
        runID: 'p1',
        ...over,
    });

    it('places items without feature_path under a flat, absolute-uri file node', () => {
        const { roots, idToRunId } = buildTestTree(tree(plain()));
        const file = byId(roots, '/repo/tests/test_plain.py')!;
        expect(file.label).toBe('test_plain.py');
        expect(file.uri).toEqual({ path: '/repo/tests/test_plain.py', absolute: true });
        const leaf = byId(file.children, 'tests/test_plain.py::test_one')!;
        expect(leaf.tags).toEqual([]);
        expect(idToRunId.get('tests/test_plain.py::test_one')).toBe('p1');
    });

    it('reuses one file node for several tests in the same file', () => {
        const { roots } = buildTestTree(tree(
            plain({ id_: 'a', runID: 'r1' }),
            plain({ id_: 'b', runID: 'r2' }),
        ));
        expect(roots).toHaveLength(1);
        expect(roots[0].children).toHaveLength(2);
    });

    it('mixes BDD and non-BDD items in one tree', () => {
        const { roots } = buildTestTree(tree(bddLeaf(), plain()));
        expect(byId(roots, 'features')).toBeDefined();
        expect(byId(roots, '/repo/tests/test_plain.py')).toBeDefined();
    });
});
