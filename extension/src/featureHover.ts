// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. The documentation text is rendered by @nokout/big-dill-core;
// this wraps it as a hover.

import * as vscode from 'vscode';
import { StepCache, extractStepText, renderStepMarkdown } from '@nokout/big-dill-core';

/** Markdown hover content for a step, or null if no definition matches. */
export function buildHoverContent(
    stepText: string,
    cache: StepCache,
): vscode.MarkdownString | null {
    const step = cache.matchPattern(stepText);
    if (!step) return null;

    const md = new vscode.MarkdownString(renderStepMarkdown(step));
    // Trusted so command links in the rendered markdown would be honoured.
    md.isTrusted = true;
    return md;
}

/** VS Code HoverProvider for .feature files. */
export class FeatureHoverProvider implements vscode.HoverProvider {
    constructor(private readonly cache: StepCache) {}

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | null {
        const stepText = extractStepText(document.lineAt(position).text);
        if (!stepText) return null;

        const content = buildHoverContent(stepText.text, this.cache);
        return content ? new vscode.Hover(content) : null;
    }
}
