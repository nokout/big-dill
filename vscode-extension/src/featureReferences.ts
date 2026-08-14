import * as vscode from 'vscode';
import { StepCache } from '@nokout/big-dill-core';
import { StepDefinition } from './testController/types';
import { extractStepText } from './featureCompletion';

const COMMENT_RE = /^\s*#/;
const KEYWORD_RE = /^\s*(?:Given|When|Then|And|But|\*)\s+/i;

/** Return 0-indexed line numbers within *lines* where *step*'s pattern matches. */
export function findReferencesInLines(lines: string[], step: StepDefinition): number[] {
    const parts = step.pattern.split(/(\{[^}]+\})/);
    const regexStr = parts
        .map((part, i) => {
            if (i % 2 === 1) {
                const name = part.replace(/^\{(\w+)(?::[^}]+)?\}$/, '$1');
                return `(?<${name}>.+?)`;
            }
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('');
    const rx = new RegExp(`^${regexStr}$`);

    const results: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (COMMENT_RE.test(line)) continue;
        const m = KEYWORD_RE.exec(line);
        if (!m) continue;
        const text = line.slice(m[0].length).trim();
        if (rx.test(text)) {
            results.push(i);
        }
    }
    return results;
}

/** VS Code ReferenceProvider for .feature files. */
export class FeatureReferencesProvider implements vscode.ReferenceProvider {
    constructor(private readonly cache: StepCache) {}

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.ReferenceContext,
        token: vscode.CancellationToken,
    ): Promise<vscode.Location[]> {
        let step: StepDefinition | null = null;

        if (document.fileName.endsWith('.feature')) {
            const rawLine = document.lineAt(position).text;
            const stepText = extractStepText(rawLine);
            if (stepText) {
                step = this.cache.matchPattern(stepText.text);
            }
        } else if (document.fileName.endsWith('.py')) {
            const lineNumber = position.line + 1;
            const fsPath = document.uri.fsPath;
            step = this.cache.getAll().find(
                s => s.file === fsPath && s.line === lineNumber,
            ) ?? null;
        }

        if (!step) return [];

        const featureUris = await vscode.workspace.findFiles('**/*.feature', '**/node_modules/**');
        const locations: vscode.Location[] = [];

        for (const uri of featureUris) {
            if (token.isCancellationRequested) break;
            const doc = await vscode.workspace.openTextDocument(uri);
            const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
            const matchedLines = findReferencesInLines(lines, step);
            for (const lineIndex of matchedLines) {
                const range = new vscode.Range(
                    new vscode.Position(lineIndex, 0),
                    new vscode.Position(lineIndex, lines[lineIndex].length),
                );
                locations.push(new vscode.Location(uri, range));
            }
        }

        return locations;
    }
}
