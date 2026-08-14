// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Renders a step definition as Markdown, for hover documentation or anywhere
// else a human-readable description of a step is wanted.

import type { StepDefinition } from '../protocol/types';

/**
 * Markdown describing *step*: its pattern, docstring summary, parameters with
 * their suggested values, tags, and where it is defined.
 *
 * Sections are omitted entirely when empty rather than rendered as headings with
 * nothing under them.
 */
export function renderStepMarkdown(step: StepDefinition): string {
    const parts: string[] = [`**\`${step.pattern}\`**`];

    if (step.summary) {
        parts.push(step.summary);
    }

    if (step.parameters.length > 0) {
        const rows = step.parameters.map((p) => {
            const values = p.suggested_values.length > 0
                ? p.suggested_values.join(', ')
                : '_(no suggested values)_';
            return `- \`{${p.name}}\` — **${p.type_name}**: ${values}`;
        });
        parts.push(`**Parameters:**\n\n${rows.join('\n')}`);
    }

    if (step.tags?.length) {
        parts.push(`**Tags:** ${step.tags.map((t) => `\`@${t}\``).join(' ')}`);
    }

    if (step.file) {
        const location = step.line ? `${step.file}:${step.line}` : step.file;
        parts.push(`_Defined in \`${location}\`_`);
    }

    return parts.join('\n\n');
}
