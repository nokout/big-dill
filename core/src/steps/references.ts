// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Finds the lines in a feature file where a given step definition is used.

import type { StepDefinition } from '../protocol/types';
import { patternToRegex } from './stepCache';

const COMMENT_RE = /^\s*#/;
const KEYWORD_RE = /^\s*(?:Given|When|Then|And|But|\*)\s+/i;

/**
 * Zero-indexed lines within *lines* whose step text matches *step*'s pattern.
 *
 * Comments are skipped, and the keyword is stripped before matching so that
 * Given/When/Then/And/But all match the same definition — which is how pytest-bdd
 * resolves them.
 */
export function findReferencesInLines(lines: string[], step: StepDefinition): number[] {
    const rx = patternToRegex(step.pattern);

    const results: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_RE.test(line)) continue;
        const m = KEYWORD_RE.exec(line);
        if (!m) continue;
        if (rx.test(line.slice(m[0].length).trim())) {
            results.push(i);
        }
    }
    return results;
}
