// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Generates a pytest-bdd step function stub for an unimplemented step.

const PARAM_RE = /\{(\w+)(?::[^}]{1,200})?\}/g;

const KEYWORD_TO_DECORATOR: Record<string, string> = {
    given: 'given',
    when: 'when',
    then: 'then',
};

/** Convert a step pattern to a Python snake_case function name. */
export function patternToFunctionName(pattern: string): string {
    return pattern
        .replace(new RegExp(PARAM_RE.source, 'g'), '$1')
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
}

/**
 * A Python step function stub for *stepText*.
 *
 * And/But map to `step`, since pytest-bdd has no decorator for them — they bind
 * to whichever of given/when/then precedes them at runtime.
 */
export function buildStepStub(stepText: string, keyword: string): string {
    const decorator = KEYWORD_TO_DECORATOR[keyword.toLowerCase()] ?? 'step';

    const paramNames: string[] = [];
    const re = new RegExp(PARAM_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(stepText)) !== null) {
        paramNames.push(m[1]);
    }

    const fnArgs = paramNames.length > 0 ? `(${paramNames.join(', ')})` : '()';

    return [
        `@${decorator}("${stepText}")`,
        `def ${patternToFunctionName(stepText)}${fnArgs}:`,
        `    raise NotImplementedError`,
    ].join('\n');
}
