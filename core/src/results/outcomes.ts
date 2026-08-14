// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Decides what an execution payload means, without applying it.
//
// Hosts turn these decisions into whatever their UI needs — TestRun calls, for a
// VS Code host. Keeping the decision separate is what makes the mapping rules
// testable without an editor.

import type { ExecutionTestPayload } from '../protocol/types';

/**
 * 'passed', 'failed', 'errored' and 'skipped' are terminal. 'enqueued' is
 * transient: it shows a pending indicator during a run, but is not stored as a
 * result, so afterwards the item reads as "not run" — visually the same as
 * skipped. Use 'skipped' to mean "deliberately did not run this time".
 */
export type RunState = 'passed' | 'failed' | 'errored' | 'skipped' | 'enqueued';

const VALID_STATES = new Set<string>(['passed', 'failed', 'errored', 'skipped', 'enqueued']);

/** Marker a host may prepend to an item awaiting a result. */
export const WAITING_PREFIX = '⏳ ';

export interface OutcomeDecision {
    /** pytest run id; the host maps this to its own item. */
    runId: string;
    state: RunState;
    /** Attached by the host for failed/errored states. */
    message?: string;
    /**
     * What to do with the waiting marker on the item's label.
     *
     * Only the custom-status path touches labels. A plain 'success' leaves the
     * label alone, so an item previously marked waiting keeps its marker — odd,
     * but existing behaviour, and encoded here rather than quietly changed.
     */
    label: 'strip' | 'prefix' | 'none';
}

/**
 * Resolve an execution payload into per-test decisions.
 *
 * `outcomeMapping` maps a pytest custom status string onto a run state; unknown
 * or invalid values fall back to 'errored'.
 *
 * Decisions are produced for every run id in the payload. Hosts skip the ones
 * they do not recognise — a run may include tests outside this tree.
 */
export function resolveExecutionOutcomes(
    payload: ExecutionTestPayload,
    outcomeMapping: Record<string, string> = {},
): OutcomeDecision[] {
    const decisions: OutcomeDecision[] = [];

    for (const [runId, result] of Object.entries(payload.result ?? {})) {
        const outcome = result.outcome ?? 'error';
        const customStatus = result.custom_status;

        switch (outcome) {
            case 'success':
                decisions.push({ runId, state: 'passed', label: 'none' });
                break;

            case 'skipped':
                decisions.push({ runId, state: 'skipped', label: 'none' });
                break;

            case 'failure':
            case 'error':
                if (customStatus) {
                    const raw = outcomeMapping[customStatus];
                    const state: RunState = VALID_STATES.has(raw) ? (raw as RunState) : 'errored';
                    decisions.push({
                        runId,
                        state,
                        message: customStatus,
                        label: state === 'enqueued' ? 'prefix' : 'strip',
                    });
                } else {
                    decisions.push({
                        runId,
                        state: 'failed',
                        message: result.message ?? result.traceback ?? outcome,
                        label: 'none',
                    });
                }
                break;

            default:
                decisions.push({ runId, state: 'errored', message: outcome, label: 'none' });
                break;
        }
    }

    // Anything the run never reported on — a crash during collection, say.
    for (const runId of payload.notFound ?? []) {
        decisions.push({ runId, state: 'errored', message: 'Test not found', label: 'none' });
    }

    return decisions;
}
