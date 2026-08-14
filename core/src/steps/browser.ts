// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// The step browser's model: what rows to show for a given grouping, filter and
// expanded group.
//
// Returns plain nodes. Rendering them — as a tree view, a list, or anything
// else — and wiring navigation is the host's job.

import * as path from 'path';
import type { StepDefinition } from '../protocol/types';

export type GroupingMode = 'file' | 'stepType' | 'tag';

export const UNKNOWN_FILE = '(unknown file)';
export const NO_TYPE = '(no type)';
export const UNTAGGED = '(untagged)';

export type StepBrowserNode =
    /** An expandable group heading. */
    | { kind: 'group'; label: string }
    /** A step, carrying its definition so the host can offer navigation. */
    | { kind: 'step'; label: string; step: StepDefinition }
    /** A non-selectable placeholder — nothing discovered, or nothing matched. */
    | { kind: 'message'; label: string };

export interface BrowseOptions {
    mode: GroupingMode;
    /** Case-insensitive substring match against the step pattern. */
    filter?: string;
    /** Label of the group being expanded. Omitted for the root level. */
    group?: string;
}

/** The group labels a step belongs under, for a given grouping. */
function keysFor(step: StepDefinition, mode: GroupingMode): string[] {
    switch (mode) {
        case 'file':
            return [step.file ? path.basename(step.file) : UNKNOWN_FILE];
        case 'stepType':
            return step.param_types?.length ? [...step.param_types] : [NO_TYPE];
        case 'tag':
            return step.tags?.length ? step.tags.map((t) => `@${t}`) : [UNTAGGED];
    }
}

export function filterSteps(steps: StepDefinition[], filter?: string): StepDefinition[] {
    const needle = (filter ?? '').toLowerCase().trim();
    if (!needle) return steps;
    return steps.filter((s) => s.pattern.toLowerCase().includes(needle));
}

/** Distinct group labels, sorted. A step may appear under several. */
export function groupLabels(steps: StepDefinition[], mode: GroupingMode): string[] {
    const labels = new Set<string>();
    for (const step of steps) {
        for (const key of keysFor(step, mode)) {
            labels.add(key);
        }
    }
    return [...labels].sort();
}

/** Steps belonging to *groupLabel*, sorted by pattern. */
export function stepsInGroup(
    steps: StepDefinition[],
    mode: GroupingMode,
    groupLabel: string,
): StepDefinition[] {
    return steps
        .filter((s) => keysFor(s, mode).includes(groupLabel))
        .sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Rows to display.
 *
 * With no `group`, returns the root level: group headings, or a single message
 * when there is nothing to show. With a `group`, returns that group's steps.
 */
export function browseSteps(
    allSteps: StepDefinition[],
    options: BrowseOptions,
): StepBrowserNode[] {
    const { mode, filter, group } = options;

    if (allSteps.length === 0) {
        return group ? [] : [{ kind: 'message', label: 'Awaiting discovery...' }];
    }

    const visible = filterSteps(allSteps, filter);
    if (visible.length === 0) {
        return group ? [] : [{ kind: 'message', label: `No steps match "${(filter ?? '').toLowerCase().trim()}"` }];
    }

    if (group === undefined) {
        return groupLabels(visible, mode).map((label) => ({ kind: 'group' as const, label }));
    }

    return stepsInGroup(visible, mode, group).map((step) => ({
        kind: 'step' as const,
        label: step.pattern,
        step,
    }));
}
