import type { GherkinDocument, TableRow } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

export const TOKEN_TYPES = [
    'gherkinDatatablePipe',
    'gherkinDatatableCell',
    'gherkinDatatableCellString',
    'gherkinExamplesPipe',
    'gherkinExamplesCell',
    'gherkinExamplesCellString',
    'gherkinExamplesHeaderCell',
] as const;

export type TokenType = (typeof TOKEN_TYPES)[number];

export interface TokenEntry {
    line: number;       // 0-indexed
    startChar: number;  // 0-indexed
    length: number;
    tokenType: TokenType;
}

export const legend = new vscode.SemanticTokensLegend([...TOKEN_TYPES], []);

function isQuoted(value: string): boolean {
    const v = value.trim();
    return (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
           (v.startsWith("'") && v.endsWith("'") && v.length >= 2);
}

function emitRow(
    row: TableRow,
    lines: string[],
    pipeType: TokenType,
    cellType: TokenType,
    cellStringType: TokenType,
    out: TokenEntry[],
): void {
    const lineIndex = row.location.line - 1;
    const lineText = lines[lineIndex] ?? '';

    const pipePositions: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === '|') pipePositions.push(i);
    }

    for (const pos of pipePositions) {
        out.push({ line: lineIndex, startChar: pos, length: 1, tokenType: pipeType });
    }

    row.cells.forEach((cell, i) => {
        const start = pipePositions[i];
        const end = pipePositions[i + 1];
        if (start === undefined || end === undefined) return;
        out.push({
            line: lineIndex,
            startChar: start + 1,
            length: end - start - 1,
            tokenType: isQuoted(cell.value) ? cellStringType : cellType,
        });
    });
}

export function buildTableTokens(doc: GherkinDocument, lines: string[]): TokenEntry[] {
    const tokens: TokenEntry[] = [];

    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;

        for (const step of scenario.steps) {
            if (step.dataTable) {
                for (const row of step.dataTable.rows) {
                    emitRow(row, lines, 'gherkinDatatablePipe', 'gherkinDatatableCell', 'gherkinDatatableCellString', tokens);
                }
            }
        }

        for (const examples of scenario.examples) {
            if (examples.tableHeader) {
                emitRow(examples.tableHeader, lines, 'gherkinExamplesPipe', 'gherkinExamplesHeaderCell', 'gherkinExamplesHeaderCell', tokens);
            }
            for (const row of examples.tableBody) {
                emitRow(row, lines, 'gherkinExamplesPipe', 'gherkinExamplesCell', 'gherkinExamplesCellString', tokens);
            }
        }
    }

    return tokens;
}

const TYPE_INDEX = Object.fromEntries(TOKEN_TYPES.map((t, i) => [t, i])) as Record<TokenType, number>;

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
