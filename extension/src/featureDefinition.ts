import * as vscode from 'vscode';
import { StepCache, extractStepText } from '@nokout/big-dill-core';

/** Build a VS Code Location for the Python implementation of *stepText*. Returns null if unavailable. */
export function buildDefinitionLocation(
    stepText: string,
    cache: StepCache,
): vscode.Location | null {
    const step = cache.matchPattern(stepText);
    if (!step || !step.file) return null;

    const uri = vscode.Uri.file(step.file);
    const lineIndex = step.line !== undefined ? Math.max(0, step.line - 1) : 0;
    const position = new vscode.Position(lineIndex, 0);
    const range = new vscode.Range(position, position);
    return new vscode.Location(uri, range);
}

/** VS Code DefinitionProvider for .feature files. */
export class FeatureDefinitionProvider implements vscode.DefinitionProvider {
    constructor(private readonly cache: StepCache) {}

    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Location | null {
        const rawLine = document.lineAt(position).text;
        const stepText = extractStepText(rawLine);
        if (!stepText) return null;
        return buildDefinitionLocation(stepText.text, this.cache);
    }
}
