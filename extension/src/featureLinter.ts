// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. The rules and their dispatch live in @nokout/big-dill-core; this
// reads configuration, debounces, and maps plain DiagnosticEntry values onto
// vscode.Diagnostic.

import * as vscode from 'vscode';
import {
    GherkinParseCache,
    lintDocument,
    type DiagnosticEntry,
    type LintConfig,
    type PhrasingRule,
} from '@nokout/big-dill-core';

/** Map core's severity vocabulary onto the editor's. */
function toSeverity(severity: DiagnosticEntry['severity']): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'warning':
            return vscode.DiagnosticSeverity.Warning;
        default:
            return vscode.DiagnosticSeverity.Information;
    }
}

export class FeatureLinter {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(private readonly cache: GherkinParseCache) {
        this.collection = vscode.languages.createDiagnosticCollection('big-dill-gherkin');
    }

    schedule(document: vscode.TextDocument): void {
        const key = document.uri.fsPath;
        const existing = this.pending.get(key);
        if (existing) clearTimeout(existing);
        this.pending.set(key, setTimeout(() => { this.lint(document); }, 300));
    }

    lint(document: vscode.TextDocument): void {
        const { doc } = this.cache.parse(document);
        if (!doc) { this.collection.delete(document.uri); return; }

        const settings = vscode.workspace.getConfiguration('big-dill');
        const config: LintConfig = {
            allowedTags: settings.get<string[]>('allowedTags') ?? [],
            phrasingRules: settings.get<PhrasingRule[]>('phrasingRules') ?? [],
        };

        const entries = lintDocument(doc, document.getText().split('\n'), config);

        this.collection.set(
            document.uri,
            entries.map((e) => new vscode.Diagnostic(
                new vscode.Range(e.line, 0, e.line, Number.MAX_SAFE_INTEGER),
                e.message,
                toSeverity(e.severity),
            )),
        );
    }

    dispose(): void {
        this.collection.dispose();
        for (const t of this.pending.values()) clearTimeout(t);
        this.pending.clear();
    }
}
