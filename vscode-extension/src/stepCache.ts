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

export class StepCache {
    private steps: StepDefinition[] = [];

    update(steps: StepDefinition[]): void {
        this.steps = steps;
    }

    getAll(): StepDefinition[] {
        return this.steps;
    }

    getForKeyword(keyword: string): StepDefinition[] {
        const norm = keyword.toLowerCase();
        return this.steps.filter(
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
