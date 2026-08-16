// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. Stub generation lives in @nokout/big-dill-core; this decides
// which diagnostics deserve a quick fix and builds the workspace edit.

import * as vscode from 'vscode';
import { StepCache, buildStepStub, extractStepText } from '@nokout/big-dill-core';

/** VS Code CodeActionProvider for unimplemented step diagnostics. */
export class FeatureCodeActionsProvider implements vscode.CodeActionProvider {
    constructor(private readonly cache: StepCache) {}

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (!diagnostic.message.startsWith('Step not implemented:')) continue;

            const lineIndex = (diagnostic.range as vscode.Range).start.line;
            const rawLine = document.lineAt(lineIndex).text;
            const stepText = extractStepText(rawLine);
            if (!stepText) continue;

            if (this.cache.matchPattern(stepText.text)) continue;

            const action = new vscode.CodeAction(
                `Generate step stub: "${stepText.text}"`,
                vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diagnostic];

            const stub = buildStepStub(stepText.text, stepText.keyword);
            const stubWithImport = [
                'from pytest_bdd import given, when, then, step',
                '',
                '',
                stub,
                '',
            ].join('\n');

            const edit = new vscode.WorkspaceEdit();
            // Write stub into a new untitled document — user must review and save
            const untitledUri = vscode.Uri.parse('untitled:step_stub.py');
            edit.insert(untitledUri, new vscode.Position(0, 0), stubWithImport);
            action.edit = edit;

            actions.push(action);
        }

        return actions;
    }
}
