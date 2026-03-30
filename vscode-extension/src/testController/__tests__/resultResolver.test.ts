// Tests for BddResultResolver.resolveExecution()
//
// Two concerns:
//   1. Mapping logic — given an execution payload, the right TestRun method is called.
//   2. Settings contract — the playground settings file uses the pytest-bdd-orama.*
//      namespace that the extension actually reads.
//
// Test (2) catches the key-mismatch bug: playground had pytest-bdd-runner.* keys which
// the extension never reads, so outcomeMapping was always empty and every custom status
// fell back to run.errored() instead of the user-configured state.

import * as fs from 'fs';
import * as path from 'path';
import { workspace } from 'vscode';
import { BddResultResolver } from '../resultResolver';
import type { ExecutionTestPayload } from '../types';
import type { TestItem, TestRun } from 'vscode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(): jest.Mocked<Pick<TestRun, 'passed' | 'failed' | 'errored' | 'skipped' | 'enqueued'>> & { end: jest.Mock } {
    return {
        passed: jest.fn(),
        failed: jest.fn(),
        errored: jest.fn(),
        skipped: jest.fn(),
        enqueued: jest.fn(),
        end: jest.fn(),
    };
}

function makeItem(id = 'item-1'): TestItem {
    return { id, label: id, children: { size: 0 } } as unknown as TestItem;
}

const RUN_ID = 'workspace/tests/test_states.py::test_scenario';

function makePayload(
    outcome: string,
    customStatus?: string,
    extra: Partial<ExecutionTestPayload['result']> = {},
): ExecutionTestPayload {
    return {
        cwd: '/workspace',
        status: 'success',
        result: {
            [RUN_ID]: { outcome, custom_status: customStatus, ...extra },
        },
        error: '',
    };
}

function makeResolver(): { resolver: BddResultResolver; item: TestItem } {
    const resolver = new BddResultResolver();
    const item = makeItem();
    resolver.itemIndex.runIdToItem.set(RUN_ID, item);
    return { resolver, item };
}

// ---------------------------------------------------------------------------
// Setup — reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    // Default: empty outcomeMapping (simulates missing/wrong settings key)
    (workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn().mockReturnValue({}),
    });
});

// ---------------------------------------------------------------------------
// Basic outcome mapping
// ---------------------------------------------------------------------------

describe('resolveExecution — standard outcomes', () => {
    test('success → run.passed()', () => {
        const { resolver, item } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('success'), run as unknown as TestRun);

        expect(run.passed).toHaveBeenCalledWith(item, undefined);
        expect(run.failed).not.toHaveBeenCalled();
    });

    test('skipped → run.skipped()', () => {
        const { resolver, item } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('skipped'), run as unknown as TestRun);

        expect(run.skipped).toHaveBeenCalledWith(item);
        expect(run.failed).not.toHaveBeenCalled();
    });

    test('failure, no custom_status → run.failed()', () => {
        const { resolver } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('failure'), run as unknown as TestRun);

        expect(run.failed).toHaveBeenCalled();
        expect(run.errored).not.toHaveBeenCalled();
    });

    test('error, no custom_status → run.failed() (same treatment as failure without custom_status)', () => {
        // When pytest sends outcome="error" with no custom_status, the resolver surfaces it
        // as a test failure rather than a separate errored state. This matches the behaviour
        // for plain assertion failures and keeps the UI consistent.
        const { resolver } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('error'), run as unknown as TestRun);

        expect(run.failed).toHaveBeenCalled();
        expect(run.errored).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Custom status → outcomeMapping
// ---------------------------------------------------------------------------

describe('resolveExecution — custom_status with outcomeMapping', () => {
    function withMapping(mapping: Record<string, string>) {
        (workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn().mockReturnValue(mapping),
        });
    }

    test('waiting mapped to enqueued → run.enqueued()', () => {
        // NOTE: 'enqueued' is a transient VS Code state, not a terminal result.
        // After run.end(), VS Code shows the item as "not run" (same icon as skipped).
        // Use 'skipped' in outcomeMapping if you want an explicit terminal result.
        withMapping({ waiting: 'enqueued', knownError: 'errored' });
        const { resolver, item } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('failure', 'waiting'), run as unknown as TestRun);

        expect(run.enqueued).toHaveBeenCalledWith(item);
        expect(run.failed).not.toHaveBeenCalled();
        expect(run.errored).not.toHaveBeenCalled();
    });

    test('knownError mapped to errored → run.errored()', () => {
        withMapping({ knownError: 'errored' });
        const { resolver } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('failure', 'knownError'), run as unknown as TestRun);

        expect(run.errored).toHaveBeenCalled();
        expect(run.failed).not.toHaveBeenCalled();
    });

    test('otherbadthing unmapped → run.errored() (default fallback)', () => {
        // otherbadthing is intentionally not in outcomeMapping; should default to errored
        withMapping({ waiting: 'enqueued', knownError: 'errored' });
        const { resolver } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('failure', 'otherbadthing'), run as unknown as TestRun);

        expect(run.errored).toHaveBeenCalled();
        expect(run.failed).not.toHaveBeenCalled();
    });

    test('custom_status with invalid mapped value → run.errored() (safe fallback)', () => {
        // Guard against a user typo like "enqueuedd" in settings
        withMapping({ waiting: 'enqueuedd' });
        const { resolver } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('failure', 'waiting'), run as unknown as TestRun);

        expect(run.errored).toHaveBeenCalled();
        expect(run.enqueued).not.toHaveBeenCalled();
    });

    test('empty outcomeMapping → custom_status falls back to errored, not failed', () => {
        // outcomeMapping = {} (e.g. because the settings key is wrong)
        // custom_status IS present but no mapping → errored, not failed
        // This distinguishes the "custom status set" path from the "no custom status" path.
        const { resolver } = makeResolver();
        const run = makeRun();

        resolver.resolveExecution(makePayload('failure', 'waiting'), run as unknown as TestRun);

        expect(run.errored).toHaveBeenCalled();
        // Critically: run.failed is NOT called — the custom_status branch is entered
        expect(run.failed).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Unknown run IDs are silently skipped
// ---------------------------------------------------------------------------

test('result with unknown run ID is skipped without throwing', () => {
    const resolver = new BddResultResolver(); // empty index
    const run = makeRun();

    const payload: ExecutionTestPayload = {
        cwd: '/workspace',
        status: 'success',
        result: { 'unknown::id': { outcome: 'failure' } },
        error: '',
    };

    expect(() => resolver.resolveExecution(payload, run as unknown as TestRun)).not.toThrow();
    expect(run.failed).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Settings contract — the playground settings file must use the correct namespace.
// This test FAILS if someone uses pytest-bdd-runner.* keys instead of pytest-bdd-orama.*.
// ---------------------------------------------------------------------------

describe('playground settings contract', () => {
    // __dirname = vscode-extension/src/testController/__tests__
    // 4x ".." → pytest-bdd-orama/ (project root)
    const SETTINGS_PATH = path.join(
        __dirname,
        '..', '..', '..', '..', 'playground', '.vscode', 'settings.json',
    );

    test('settings file exists and is valid JSON', () => {
        expect(fs.existsSync(SETTINGS_PATH)).toBe(true);
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
        expect(() => JSON.parse(raw)).not.toThrow();
    });

    test('settings use pytest-bdd-orama.* namespace (not pytest-bdd-runner.*)', () => {
        const settings: Record<string, unknown> = JSON.parse(
            fs.readFileSync(SETTINGS_PATH, 'utf-8'),
        );
        const keys = Object.keys(settings);

        // None of the keys should use the wrong (old) namespace
        const wrongKeys = keys.filter((k) => k.startsWith('pytest-bdd-runner.'));
        expect(wrongKeys).toEqual([]);

        // The outcomeMapping key must use the correct namespace so the extension can read it
        const hasMapping = keys.some((k) => k === 'pytest-bdd-orama.outcomeMapping');
        expect(hasMapping).toBe(true);
    });

    test('outcomeMapping contains valid VSCode run states', () => {
        const settings: Record<string, unknown> = JSON.parse(
            fs.readFileSync(SETTINGS_PATH, 'utf-8'),
        );
        const mapping = settings['pytest-bdd-orama.outcomeMapping'] as Record<string, string>;
        const validStates = new Set(['passed', 'failed', 'errored', 'skipped', 'enqueued']);

        for (const [status, state] of Object.entries(mapping)) {
            expect(validStates.has(state)).toBe(true);
            expect(status.length).toBeGreaterThan(0);
        }
    });
});
