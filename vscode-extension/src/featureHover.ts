import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { StepDefinition } from './testController/types';
import { extractStepText } from './featureCompletion';

/** Build markdown hover content for a step. Returns null if no match. */
export function buildHoverContent(
    stepText: string,
    cache: StepCache,
): vscode.MarkdownString | null {
    const step = cache.matchPattern(stepText);
    if (!step) return null;
    return renderStepHover(step);
}

function renderStepHover(step: StepDefinition): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    // Pattern heading
    md.appendMarkdown(`**\`${step.pattern}\`**\n\n`);

    // Docstring summary
    if (step.summary) {
        md.appendMarkdown(`${step.summary}\n\n`);
    }

    // Param types
    if (step.parameters.length > 0) {
        md.appendMarkdown('**Parameters:**\n\n');
        for (const param of step.parameters) {
            const values = param.suggested_values.length > 0
                ? param.suggested_values.join(', ')
                : '_(no suggested values)_';
            md.appendMarkdown(`- \`{${param.name}}\` — **${param.type_name}**: ${values}\n`);
        }
        md.appendMarkdown('\n');
    }

    // Tags
    if (step.tags && step.tags.length > 0) {
        const tagList = step.tags.map(t => `\`@${t}\``).join(' ');
        md.appendMarkdown(`**Tags:** ${tagList}\n\n`);
    }

    // Source location (informational only)
    if (step.file) {
        const loc = step.line ? `${step.file}:${step.line}` : step.file;
        md.appendMarkdown(`_Defined in \`${loc}\`_`);
    }

    return md;
}

/** VS Code HoverProvider for .feature files. */
export class FeatureHoverProvider implements vscode.HoverProvider {
    constructor(private readonly cache: StepCache) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | null {
        const rawLine = document.lineAt(position).text;
        const stepText = extractStepText(rawLine);
        if (!stepText) return null;

        const content = buildHoverContent(stepText.text, this.cache);
        if (!content) return null;

        return new vscode.Hover(content);
    }
}
