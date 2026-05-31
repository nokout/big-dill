import { StepDefinition, StepParameter } from './testController/types';

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
function patternToRegex(pattern: string): RegExp {
    // Escape regex metacharacters except our own {} placeholders
    const parts = pattern.split(/(\{[^}]+\})/);
    const regexStr = parts
        .map((part, i) => {
            if (i % 2 === 1) {
                // parameter placeholder — extract name, create named capture group
                const name = part.replace(/^\{(\w+)(?::[^}]+)?\}$/, '$1');
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

        for (const line of lines) {
            const stepText = stripKeyword(line);
            if (!stepText) continue;
            for (const step of [...this.steps, ...this.distributedSteps]) {
                const rx = patternToRegex(step.pattern);
                if (rx.test(stepText.trim())) {
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
     */
    paramPositionAt(lineText: string, column: number): ParamAtPosition | null {
        for (const step of this.steps) {
            const rx = patternToRegex(step.pattern);
            const m = rx.exec(lineText);
            if (!m?.groups) continue;

            let searchFrom = 0;
            for (const param of step.parameters) {
                const value = m.groups[param.name];
                if (value === undefined) continue;
                const idx = lineText.indexOf(value, searchFrom);
                if (idx === -1) continue;
                const end = idx + value.length;
                if (column >= idx && column <= end) {
                    return { parameter: param, valueStart: idx, valueEnd: end };
                }
                searchFrom = end;
            }
        }
        return null;
    }
}
