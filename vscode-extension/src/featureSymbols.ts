import type { GherkinDocument } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

export function buildSymbols(doc: GherkinDocument): vscode.DocumentSymbol[] {
    if (!doc.feature) return [];

    const feature = doc.feature;
    const featureStart = (feature.location?.line ?? 1) - 1;
    const featureRange = new vscode.Range(featureStart, 0, featureStart, Number.MAX_SAFE_INTEGER);

    const featureSymbol = new vscode.DocumentSymbol(
        feature.name || '(unnamed feature)',
        '',
        vscode.SymbolKind.Module,
        featureRange,
        featureRange,
    );

    for (const child of feature.children) {
        const scenario = child.scenario ?? child.background;
        if (!scenario) continue;

        const lineIndex = (scenario.location?.line ?? 1) - 1;
        const range = new vscode.Range(lineIndex, 0, lineIndex, Number.MAX_SAFE_INTEGER);

        const tags = ('tags' in scenario ? scenario.tags ?? [] : [])
            .map((t) => t.name)
            .join(' ');

        const symbol = new vscode.DocumentSymbol(
            scenario.name || (child.background ? '(background)' : '(unnamed scenario)'),
            tags,
            vscode.SymbolKind.Function,
            range,
            range,
        );
        featureSymbol.children.push(symbol);
    }

    return [featureSymbol];
}

export class FeatureSymbolsProvider implements vscode.DocumentSymbolProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const { doc } = this.cache.parse(document);
        return doc ? buildSymbols(doc) : [];
    }
}
