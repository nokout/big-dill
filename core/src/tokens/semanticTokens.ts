// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Computes semantic token positions for Gherkin tables — pipes, cells, and
// quoted cells, distinguished between datatables and Examples tables.
//
// Returns plain positions. Encoding them into whatever the host's highlighter
// expects, and declaring the legend, is the host's job.

import type { GherkinDocument, TableRow } from '@cucumber/messages';

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

/** Position of each token type in the legend a host declares. */
export const TYPE_INDEX = Object.fromEntries(TOKEN_TYPES.map((t, i) => [t, i])) as Record<TokenType, number>;
