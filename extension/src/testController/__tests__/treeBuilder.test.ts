// Characterisation tests for buildTree.
//
// Written *before* extracting the tree-shape computation into core, to pin the
// current behaviour rather than the intended behaviour. Anything surprising here
// is deliberate: the point is that a refactor must not change it. Quirks are
// called out where they are pinned.

import { createFakeTestController, type FakeTestItem } from './fakeTestController';
import { buildTree } from '../treeBuilder';
import type { DiscoveredTestNode, IBddTestItemIndex } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */

function newIndex(): IBddTestItemIndex {
    return { idToRunId: new Map(), runIdToItem: new Map() } as any;
}

const CWD = { fsPath: '/repo' } as any;

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

function build(root: DiscoveredTestNode) {
    const tc = createFakeTestController();
    const index = newIndex();
    buildTree(tc as any, root, CWD, index);
    return { tc, index };
}

/** Depth-first lookup by id, so assertions do not depend on nesting depth. */
function find(items: { all(): FakeTestItem[] }, id: string): FakeTestItem | undefined {
    for (const item of items.all()) {
        if (item.id === id) return item;
        const nested = find(item.children, id);
        if (nested) return nested;
    }
    return undefined;
}

describe('buildTree — BDD items', () => {
    it('nests feature files under folders derived from feature_path', () => {
        const { tc } = build(tree(bddLeaf()));

        const features = tc.items.get('features');
        expect(features).toBeDefined();
        expect(features!.label).toBe('Features 🗂');

        const states = features!.children.get('states');
        expect(states).toBeDefined();
        expect(states!.label).toBe('States 🗂');

        const file = states!.children.get('features/states/basic_states.feature');
        expect(file).toBeDefined();
    });

    it('labels the feature file from feature_name, falling back to a sentence-cased stem', () => {
        const withName = build(tree(bddLeaf({ feature_name: 'Basic test states' })));
        expect(find(withName.tc.items, 'features/states/basic_states.feature')!.label)
            .toBe('Basic test states 🗒');

        const withoutName = build(tree(bddLeaf()));
        expect(find(withoutName.tc.items, 'features/states/basic_states.feature')!.label)
            .toBe('Basic states 🗒');
    });

    it('keys the scenario as featurePath::scenarioName and labels it with the scenario name', () => {
        const { tc } = build(tree(bddLeaf()));
        const scenario = find(tc.items, 'features/states/basic_states.feature::A passing scenario');
        expect(scenario).toBeDefined();
        expect(scenario!.label).toBe('A passing scenario');
    });

    it('falls back to name when scenario_name is absent', () => {
        const { tc } = build(tree(bddLeaf({ scenario_name: undefined })));
        expect(find(tc.items, 'features/states/basic_states.feature::test_a_passing_scenario'))
            .toBeDefined();
    });

    it('gives a scenario both feature and scenario tags, and describes it with its own', () => {
        const { tc } = build(tree(bddLeaf({
            feature_tags: ['smoke'],
            scenario_tags: ['passes', 'fast'],
        })));
        const scenario = find(tc.items, 'features/states/basic_states.feature::A passing scenario')!;
        expect(scenario.tags.map((t) => t.id)).toEqual(['smoke', 'passes', 'fast']);
        expect(scenario.description).toBe('@passes @fast');

        const file = find(tc.items, 'features/states/basic_states.feature')!;
        expect(file.tags.map((t) => t.id)).toEqual(['smoke']);
        expect(file.description).toBe('@smoke');
    });

    it('converts lineno to a zero-based range spanning to the next line', () => {
        const { tc } = build(tree(bddLeaf({ lineno: 12 })));
        const scenario = find(tc.items, 'features/states/basic_states.feature::A passing scenario')!;
        expect(scenario.range).toEqual({ start: { line: 11, character: 0 }, end: { line: 12, character: 0 } });
    });

    it('accepts lineno as a string', () => {
        const { tc } = build(tree(bddLeaf({ lineno: '12' })));
        const scenario = find(tc.items, 'features/states/basic_states.feature::A passing scenario')!;
        expect(scenario.range).toEqual({ start: { line: 11, character: 0 }, end: { line: 12, character: 0 } });
    });

    it('omits the range entirely when lineno is zero or unparseable', () => {
        for (const lineno of [0, -1, 'nonsense']) {
            const { tc } = build(tree(bddLeaf({ lineno })));
            const scenario = find(tc.items, 'features/states/basic_states.feature::A passing scenario')!;
            expect(scenario.range).toBeUndefined();
        }
    });

    it('groups sibling scenarios under one feature file node', () => {
        const { tc } = build(tree(
            bddLeaf({ scenario_name: 'First', runID: 'r1' }),
            bddLeaf({ scenario_name: 'Second', runID: 'r2' }),
        ));
        const file = find(tc.items, 'features/states/basic_states.feature')!;
        expect(file.children.all().map((c) => c.label).sort()).toEqual(['First', 'Second']);
    });

    it('populates the run-id index in both directions', () => {
        const { tc, index } = build(tree(bddLeaf({ runID: 'run-xyz' })));
        const id = 'features/states/basic_states.feature::A passing scenario';
        expect(index.idToRunId.get(id)).toBe('run-xyz');
        expect(index.runIdToItem.get('run-xyz')).toBe(find(tc.items, id));
    });

    // Folder ids are only the path segment, not the full path — but lookups are
    // scoped to the current level's children, so same-named directories under
    // different parents stay separate. Pinned because the id scheme looks like it
    // should collide and does not.
    it('keeps same-named folders separate when they have different parents', () => {
        const { tc } = build(tree(
            bddLeaf({ feature_path: 'a/shared/one.feature', scenario_name: 'S1', runID: 'r1' }),
            bddLeaf({ feature_path: 'b/shared/two.feature', scenario_name: 'S2', runID: 'r2' }),
        ));
        expect(tc.items.get('a')).toBeDefined();
        expect(tc.items.get('b')).toBeDefined();
        const sharedUnderA = tc.items.get('a')!.children.get('shared')!;
        const sharedUnderB = tc.items.get('b')!.children.get('shared')!;
        expect(sharedUnderA.children.get('a/shared/one.feature')).toBeDefined();
        expect(sharedUnderB.children.get('b/shared/two.feature')).toBeDefined();
        expect(sharedUnderA.children.get('b/shared/two.feature')).toBeUndefined();
    });

    // Pinned quirk: every folder level is joined to the cwd using only its own
    // segment, so a nested folder claims /repo/<segment> rather than its true
    // path. Wrong, but pinned so the extraction cannot change it by accident —
    // fixing it is a separate change with its own test.
    it('gives every folder a uri of cwd + its own segment, not its full path', () => {
        const { tc } = build(tree(bddLeaf()));
        expect(tc.items.get('features')!.uri!.fsPath).toBe('/repo/features');
        expect(tc.items.get('features')!.children.get('states')!.uri!.fsPath).toBe('/repo/states');
    });

    it('gives feature files and scenarios the full feature path', () => {
        const { tc } = build(tree(bddLeaf()));
        const file = find(tc.items, 'features/states/basic_states.feature')!;
        expect(file.uri!.fsPath).toBe('/repo/features/states/basic_states.feature');
        const scenario = find(tc.items, 'features/states/basic_states.feature::A passing scenario')!;
        expect(scenario.uri!.fsPath).toBe('/repo/features/states/basic_states.feature');
    });

    it('handles a feature file at the root with no directory parts', () => {
        const { tc } = build(tree(bddLeaf({ feature_path: 'top.feature', scenario_name: 'S' })));
        expect(find(tc.items, 'top.feature::S')).toBeDefined();
    });
});

describe('buildTree — non-BDD items', () => {
    const plain = (over: Record<string, unknown> = {}): any => ({
        path: '/repo/tests/test_plain.py',
        name: 'test_one',
        type_: 'test',
        id_: 'tests/test_plain.py::test_one',
        lineno: 5,
        runID: 'p1',
        ...over,
    });

    it('places items without feature_path under a flat file node', () => {
        const { tc, index } = build(tree(plain()));
        const file = tc.items.get('/repo/tests/test_plain.py')!;
        expect(file.label).toBe('test_plain.py');
        const leaf = file.children.get('tests/test_plain.py::test_one')!;
        expect(leaf.label).toBe('test_one');
        expect(leaf.tags).toEqual([]);
        expect(index.runIdToItem.get('p1')).toBe(leaf);
    });

    it('reuses one file node for several tests in the same file', () => {
        const { tc } = build(tree(
            plain({ id_: 'a', runID: 'r1' }),
            plain({ id_: 'b', runID: 'r2' }),
        ));
        expect(tc.items.all()).toHaveLength(1);
        expect(tc.items.get('/repo/tests/test_plain.py')!.children.all()).toHaveLength(2);
    });
});

describe('buildTree — rebuilds', () => {
    it('clears previous items and index entries before rebuilding', () => {
        const tc = createFakeTestController();
        const index = newIndex();

        buildTree(tc as any, tree(bddLeaf({ runID: 'old' })), CWD, index);
        buildTree(tc as any, tree(bddLeaf({
            feature_path: 'features/other.feature', scenario_name: 'New', runID: 'new',
        })), CWD, index);

        expect(index.idToRunId.size).toBe(1);
        expect(index.runIdToItem.has('old')).toBe(false);
        expect(index.runIdToItem.has('new')).toBe(true);
        expect(find(tc.items, 'features/states/basic_states.feature')).toBeUndefined();
    });
});
