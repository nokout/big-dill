// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. Matching, ranking and snippet construction live in
// @nokout/big-dill-core; this maps entries onto vscode.CompletionItem.

import * as vscode from 'vscode';
import {
    StepCache,
    completeAt,
    extractStepText,
    type CompletionEntry,
} from '@nokout/big-dill-core';
import { outputChannel } from './extension';

const KINDS: Record<CompletionEntry['kind'], vscode.CompletionItemKind> = {
    step: vscode.CompletionItemKind.Snippet,
    value: vscode.CompletionItemKind.EnumMember,
};

function toItem(entry: CompletionEntry): vscode.CompletionItem {
    const item = new vscode.CompletionItem(entry.label, KINDS[entry.kind]);
    item.insertText = entry.snippet ? new vscode.SnippetString(entry.insertText) : entry.insertText;
    if (entry.detail !== undefined) {
        item.detail = entry.detail;
    }
    if (entry.sortText !== undefined) {
        item.sortText = entry.sortText;
    }
    return item;
}

/** VS Code CompletionItemProvider for .feature files. */
export class FeatureCompletionProvider implements vscode.CompletionItemProvider {
    constructor(private readonly cache: StepCache) {}

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        try {
            const line = document.lineAt(position).text;
            const parsed = extractStepText(line);
            if (parsed) {
                outputChannel?.appendLine(
                    `[completions] keyword=${parsed.keyword} text="${parsed.text}" ` +
                    `cacheSize=${this.cache.getAll().length}`,
                );
            }
            return completeAt(line, position.character, this.cache).map(toItem);
        } catch (err) {
            outputChannel?.appendLine(`[completions] ERROR: ${err}`);
            return [];
        }
    }
}
