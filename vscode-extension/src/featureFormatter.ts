import type { GherkinDocument, TableRow } from '@cucumber/messages';
import * as vscode from 'vscode';
import { GherkinParseCache } from './gherkinParser';

export interface TextEditEntry {
    startLine: number;  // 0-indexed
    newText: string;
}

function isNumeric(v: string): boolean {
    return /^-?\d+(\.\d+)?$/.test(v.trim());
}

function indent(lineText: string): string {
    return lineText.match(/^(\s*)/)?.[1] ?? '';
}

function formatRows(
    rows: readonly TableRow[],
    lines: string[],
    rightAlignNumericCols: boolean,
    headerRows: readonly TableRow[] = [],
): TextEditEntry[] {
    if (rows.length === 0) return [];

    const colCount = rows[0].cells.length;
    const widths = Array<number>(colCount).fill(0);
    const allNumeric = Array<boolean>(colCount).fill(true);

    const allRows = [...headerRows, ...rows];

    for (const row of allRows) {
        row.cells.forEach((cell, i) => {
            widths[i] = Math.max(widths[i], cell.value.length);
        });
    }

    // Determine which columns are purely numeric (checking body rows only; headers are text labels)
    // A column is numeric only if all body values are numeric (empty cells are skipped)
    // We do NOT count header rows in allNumeric — the header is always left-aligned regardless
    // But we DO disqualify a column from right-alignment if the header value is numeric too
    // (since column names like "n" are non-numeric text, only pure-numeric body cols are right-aligned)
    for (const row of rows) {
        row.cells.forEach((cell, i) => {
            if (cell.value !== '' && !isNumeric(cell.value)) allNumeric[i] = false;
        });
    }
    // Also check header cells — if the header is non-empty, it's always non-numeric text
    // so columns with text headers can still be right-aligned if body is all numeric
    // (the header itself is left-aligned via the isHeader flag below)

    const edits: TextEditEntry[] = [];

    const formatRow = (row: TableRow, isHeader: boolean): void => {
        const lineIndex = row.location.line - 1;
        const original = lines[lineIndex] ?? '';
        const pad = indent(original);
        const cells = row.cells.map((cell, i) => {
            // Header cells of numeric columns are left-aligned
            if (rightAlignNumericCols && allNumeric[i] && !isHeader) {
                return cell.value.padStart(widths[i]);
            }
            return cell.value.padEnd(widths[i]);
        });
        const newText = `${pad}| ${cells.join(' | ')} |`;
        if (newText !== original) {
            edits.push({ startLine: lineIndex, newText });
        }
    };

    for (const row of headerRows) {
        formatRow(row, true);
    }
    for (const row of rows) {
        formatRow(row, false);
    }

    return edits;
}

export function formatTables(doc: GherkinDocument, lines: string[]): TextEditEntry[] {
    const edits: TextEditEntry[] = [];

    for (const child of doc.feature?.children ?? []) {
        const scenario = child.scenario;
        if (!scenario) continue;

        for (const step of scenario.steps) {
            if (step.dataTable) {
                edits.push(...formatRows(step.dataTable.rows, lines, false));
            }
        }

        for (const examples of scenario.examples) {
            const headerRows = examples.tableHeader ? [examples.tableHeader] : [];
            edits.push(...formatRows(examples.tableBody, lines, true, headerRows));
        }
    }

    return edits;
}

export class FeatureFormattingProvider implements vscode.DocumentFormattingEditProvider {
    constructor(private readonly cache: GherkinParseCache) {}

    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const { doc } = this.cache.parse(document);
        if (!doc) return [];

        const lines = document.getText().split('\n');
        return formatTables(doc, lines).map((e) =>
            vscode.TextEdit.replace(
                new vscode.Range(e.startLine, 0, e.startLine, lines[e.startLine]?.length ?? 0),
                e.newText,
            ),
        );
    }
}
