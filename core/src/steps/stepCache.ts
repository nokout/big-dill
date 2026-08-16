import { StepDefinition, StepParameter } from '../protocol/types';

export type LineMatch = {
    step: StepDefinition;
    params: Record<string, string>;
};

export type ParamAtPosition = {
    parameter: StepParameter;
    valueStart: number;
    valueEnd: number;
};

/** Convert a step pattern to a regex with named capture groups for each parameter. */
/**
 * Convert a step pattern to an anchored regex with a named capture per parameter.
 *
 * Exported because reference-finding needs the identical conversion; a second
 * copy of this drifted once already (it missed the bounded-quantifier fix for
 * ReDoS), so there is deliberately only one.
 */
export function patternToRegex(pattern: string): RegExp {
    // Escape regex metacharacters except our own {} placeholders
    const parts = pattern.split(/(\{[^}]{1,200}\})/);
    const regexStr = parts
        .map((part, i) => {
            if (i % 2 === 1) {
                // parameter placeholder — extract name, create named capture group
                const name = part.replace(/^\{(\w+)(?::[^}]{1,200})?\}$/, '$1');
                return `(?<${name}>.+?)`;
            }
            // literal text — escape regex metacharacters
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
    return new RegExp(`^${regexStr}$`);
}

/** Strip Gherkin keyword prefix from a raw feature file step line. */
const KEYWORD_RE = /^\s*(?:Given|When|Then|And|But|\*)\s+/i;
function stripKeyword(line: string): string | null {
    const m = KEYWORD_RE.exec(line);
    return m ? line.slice(m[0].length) : null;
}

export class StepCache {
    private steps: StepDefinition[] = [];
    private distributedSteps: StepDefinition[] = [];

    update(steps: StepDefinition[]): void {
        this.steps = steps.map(s => ({ ...s, usage_count: s.usage_count ?? 0 }));
    }

    updateDistributed(steps: StepDefinition[]): void {
        this.distributedSteps = steps.map(s => ({ ...s, usage_count: s.usage_count ?? 0 }));
    }

    /**
     * Scan *lines* (raw text lines from .feature files) and set `usage_count`
     * on each step in the cache to the number of times that step pattern matches.
     * Resets all counts to 0 before counting.
     */
    updateUsageCounts(lines: string[]): void {
        // Reset
        for (const s of [...this.steps, ...this.distributedSteps]) {
            s.usage_count = 0;
        }

        // Precompile one regex per step (not per line)
        const allSteps = [...this.steps, ...this.distributedSteps];
        const compiled = allSteps.map(s => ({ step: s, rx: patternToRegex(s.pattern) }));

        for (const line of lines) {
            const stepText = stripKeyword(line);
            if (!stepText) continue;
            const trimmed = stepText.trim();
            for (const { step, rx } of compiled) {
                if (rx.test(trimmed)) {
                    step.usage_count = (step.usage_count ?? 0) + 1;
                }
            }
        }
    }

    getAll(): StepDefinition[] {
        return [...this.distributedSteps, ...this.steps];
    }

    getForKeyword(keyword: string): StepDefinition[] {
        const norm = keyword.toLowerCase();
        return this.getAll().filter(
            (s) => s.keyword === norm || s.keyword === 'step'
        );
    }

    /** Match full step text (no keyword prefix) against cached patterns. */
    matchLine(stepText: string): LineMatch | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(stepText);
            if (m?.groups) {
                return { step, params: { ...m.groups } };
            }
        }
        return null;
    }

    /**
     * Return the step definition whose pattern matches *stepText* (no keyword prefix),
     * or null if no pattern matches. Used by hover, definition, and linting.
     */
    matchPattern(stepText: string): StepDefinition | null {
        const trimmed = stepText.trim();
        for (const step of this.getAll()) {
            const rx = patternToRegex(step.pattern);
            if (rx.test(trimmed)) {
                return step;
            }
        }
        return null;
    }

    /**
     * Return the parameter the cursor (at *column*) sits inside on *lineText*,
     * or null if the cursor is not inside a parameter value.
     *
     * Positions are computed by walking literal segment lengths so that a
     * placeholder value that also appears in the literal prefix (e.g. "state"
     * in "the state is {state:AustralianState}") resolves to the correct span.
     */
    paramPositionAt(lineText: string, column: number): ParamAtPosition | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(lineText);
            if (!m?.groups) continue;

            // Split pattern into alternating [literal, placeholder, literal, ...]
            const segments = step.pattern.split(/(\{[^}]{1,200}\})/);

            let pos = 0;      // cursor into lineText as we consume each segment
            let paramIdx = 0; // index into step.parameters

            for (let i = 0; i < segments.length; i++) {
                if (i % 2 === 0) {
                    // literal segment — advance pos by its length
                    pos += segments[i].length;
                } else {
                    // parameter placeholder — the captured value starts at pos
                    const name = segments[i].replace(/^\{(\w+)(?::[^}]{1,200})?\}$/, '$1');
                    const value = m.groups[name];
                    if (value !== undefined) {
                        const valueStart = pos;
                        const valueEnd = pos + value.length;
                        if (column >= valueStart && column <= valueEnd) {
                            const param = step.parameters[paramIdx];
                            if (param) {
                                return { parameter: param, valueStart, valueEnd };
                            }
                        }
                        pos = valueEnd;
                    }
                    paramIdx++;
                }
            }
        }
        return null;
    }
}
