// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Finds steps in a feature file with no matching definition.

import type { StepCache } from './stepCache';
import { extractStepText } from '../completion/complete';

const COMMENT_RE = /^\s*#/;

export type UnimplementedStep = {
    /** 0-indexed line. */
    lineIndex: number;
    /** Step text with the Gherkin keyword stripped. */
    stepText: string;
};

/** Steps in *lines* that no definition in *cache* matches. Comments are skipped. */
export function findUnimplementedSteps(lines: string[], cache: StepCache): UnimplementedStep[] {
    const results: UnimplementedStep[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_RE.test(line)) continue;
        const parsed = extractStepText(line);
        if (!parsed) continue;
        if (!cache.matchPattern(parsed.text)) {
            results.push({ lineIndex: i, stepText: parsed.text });
        }
    }
    return results;
}
