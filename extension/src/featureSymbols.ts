// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. The outline is computed by @nokout/big-dill-core; this maps its
// nodes onto vscode.DocumentSymbol.

import * as vscode from 'vscode';
import { GherkinParseCache, buildSymbolTree, type SymbolNode } from '@nokout/big-dill-core';

const KINDS: Record<SymbolNode['kind'], vscode.SymbolKind> = {
    feature: vscode.SymbolKind.Module,
    scenario: vscode.SymbolKind.Function,
};

function toSymbol(node: SymbolNode): vscode.DocumentSymbol {
    // Full-width range: Gherkin constructs occupy their whole line.
    const range = new vscode.Range(node.line, 0, node.line, Number.MAX_SAFE_INTEGER);
    const symbol = new vscode.DocumentSymbol(node.name, node.detail, KINDS[node.kind], range, range);
    symbol.children.push(...node.children.map(toSymbol));
    return symbol;
}

export function buildSymbols(doc: Parameters<typeof buildSymbolTree>[0]): vscode.DocumentSymbol[] {
    return buildSymbolTree(doc).map(toSymbol);
}

export class FeatureSymbolsProvider implements vscode.DocumentSymbolProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const { doc } = this.cache.parse(document);
        return doc ? buildSymbols(doc) : [];
    }
}
