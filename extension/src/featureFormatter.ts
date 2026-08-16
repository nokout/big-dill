// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. Alignment is computed by @nokout/big-dill-core; this turns the
// resulting line replacements into editor edits.

import * as vscode from 'vscode';
import { GherkinParseCache, formatTables } from '@nokout/big-dill-core';

export class FeatureFormattingProvider implements vscode.DocumentFormattingEditProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const { doc } = this.cache.parse(document);
        if (!doc) return [];

        const lines = document.getText().split('\n');
        return formatTables(doc, lines).map((e) =>
            vscode.TextEdit.replace(
                new vscode.Range(e.startLine, 0, e.startLine, lines[e.startLine]?.length ?? 0),
                e.newText,
            ),
        );
    }
}
