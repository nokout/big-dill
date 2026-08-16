// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. Token positions are computed by @nokout/big-dill-core; this
// declares the legend and encodes them for the editor.

import * as vscode from 'vscode';
import { GherkinParseCache, TOKEN_TYPES, TYPE_INDEX, buildTableTokens } from '@nokout/big-dill-core';

export const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES], []);

export class FeatureSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
        const { doc } = this.cache.parse(document);
        const builder = new vscode.SemanticTokensBuilder(legend);
        if (!doc) return builder.build();

        const lines = document.getText().split('\n');
        for (const entry of buildTableTokens(doc, lines)) {
            builder.push(entry.line, entry.startChar, entry.length, TYPE_INDEX[entry.tokenType], 0);
        }
        return builder.build();
    }
}
