// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. Matching lives in @nokout/big-dill-core; this walks the
// workspace's feature files and turns matches into Locations.

import * as vscode from 'vscode';
import {
    StepCache,
    extractStepText,
    findReferencesInLines,
    type StepDefinition,
} from '@nokout/big-dill-core';

/** VS Code ReferenceProvider for .feature files. */
export class FeatureReferencesProvider implements vscode.ReferenceProvider {
    constructor(private readonly cache: StepCache) {}

    /** Which step is being asked about — from a .feature line, or a .py definition. */
    private stepAt(document: vscode.TextDocument, position: vscode.Position): StepDefinition | null {
        if (document.fileName.endsWith('.feature')) {
            const stepText = extractStepText(document.lineAt(position).text);
            return stepText ? this.cache.matchPattern(stepText.text) : null;
        }
        if (document.fileName.endsWith('.py')) {
            const lineNumber = position.line + 1;
            const fsPath = document.uri.fsPath;
            return this.cache.getAll().find((s) => s.file === fsPath && s.line === lineNumber) ?? null;
        }
        return null;
    }

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        token: vscode.CancellationToken,
    ): Promise<vscode.Location[]> {
        const step = this.stepAt(document, position);
        if (!step) return [];

        const featureUris = await vscode.workspace.findFiles('**/*.feature', '**/node_modules/**');
        const locations: vscode.Location[] = [];

        for (const uri of featureUris) {
            if (token.isCancellationRequested) break;
            const doc = await vscode.workspace.openTextDocument(uri);
            const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);

            for (const lineIndex of findReferencesInLines(lines, step)) {
                locations.push(new vscode.Location(uri, new vscode.Range(
                    new vscode.Position(lineIndex, 0),
                    new vscode.Position(lineIndex, lines[lineIndex].length),
                )));
            }
        }

        return locations;
    }
}
