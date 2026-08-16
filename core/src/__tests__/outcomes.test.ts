import { resolveExecutionOutcomes } from '../results/outcomes';
import type { ExecutionTestPayload } from '../protocol/types';

function payload(result: Record<string, unknown>, extra: Record<string, unknown> = {}): ExecutionTestPayload {
    return { cwd: '/repo', status: 'success', error: '', result, ...extra } as ExecutionTestPayload;
}

const only = (p: ExecutionTestPayload, mapping?: Record<string, string>) =>
    resolveExecutionOutcomes(p, mapping)[0];

describe('resolveExecutionOutcomes', () => {
    it('maps success and skipped straight through, leaving labels alone', () => {
        expect(only(payload({ r1: { outcome: 'success' } })))
            .toEqual({ runId: 'r1', state: 'passed', label: 'none' });
        expect(only(payload({ r1: { outcome: 'skipped' } })))
            .toEqual({ runId: 'r1', state: 'skipped', label: 'none' });
    });

    it('reports a plain failure with message, falling back to traceback then outcome', () => {
        expect(only(payload({ r1: { outcome: 'failure', message: 'boom', traceback: 'tb' } })).message)
            .toBe('boom');
        expect(only(payload({ r1: { outcome: 'failure', traceback: 'tb' } })).message)
            .toBe('tb');
        expect(only(payload({ r1: { outcome: 'failure' } })).message)
            .toBe('failure');
    });

    it('treats a missing outcome as an error', () => {
        expect(only(payload({ r1: {} })).state).toBe('failed');
    });

    it('applies the user mapping to a custom status', () => {
        const d = only(
            payload({ r1: { outcome: 'failure', custom_status: 'waiting' } }),
            { waiting: 'enqueued' },
        );
        expect(d.state).toBe('enqueued');
        expect(d.message).toBe('waiting');
    });

    it('falls back to errored for an unmapped or invalid custom status', () => {
        expect(only(payload({ r1: { outcome: 'failure', custom_status: 'unknown' } })).state)
            .toBe('errored');
        expect(only(
            payload({ r1: { outcome: 'failure', custom_status: 'weird' } }),
            { weird: 'not-a-state' },
        ).state).toBe('errored');
    });

    it('prefixes the label only for enqueued, and strips it for every other mapped state', () => {
        expect(only(
            payload({ r1: { outcome: 'error', custom_status: 'waiting' } }),
            { waiting: 'enqueued' },
        ).label).toBe('prefix');

        for (const state of ['passed', 'failed', 'skipped', 'errored']) {
            expect(only(
                payload({ r1: { outcome: 'error', custom_status: 'x' } }),
                { x: state },
            ).label).toBe('strip');
        }
    });

    it('errors on an unrecognised outcome, carrying it as the message', () => {
        expect(only(payload({ r1: { outcome: 'bizarre' } })))
            .toEqual({ runId: 'r1', state: 'errored', message: 'bizarre', label: 'none' });
    });

    it('errors every run id the report never covered', () => {
        const decisions = resolveExecutionOutcomes(
            payload({ r1: { outcome: 'success' } }, { notFound: ['r2', 'r3'] }),
        );
        expect(decisions).toHaveLength(3);
        expect(decisions.slice(1)).toEqual([
            { runId: 'r2', state: 'errored', message: 'Test not found', label: 'none' },
            { runId: 'r3', state: 'errored', message: 'Test not found', label: 'none' },
        ]);
    });

    it('returns nothing for an empty payload', () => {
        expect(resolveExecutionOutcomes({ cwd: '/r', status: 'success', error: '' } as ExecutionTestPayload))
            .toEqual([]);
    });

    it('decides for every run id, leaving the host to ignore ones it does not know', () => {
        const decisions = resolveExecutionOutcomes(
            payload({ mine: { outcome: 'success' }, theirs: { outcome: 'success' } }),
        );
        expect(decisions.map((d) => d.runId)).toEqual(['mine', 'theirs']);
    });
});
