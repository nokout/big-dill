import { generateMessages } from '@cucumber/gherkin';
import { SourceMediaType } from '@cucumber/messages';
import type { GherkinDocument } from '@cucumber/messages';
import type * as vscode from 'vscode';

export interface ParseResult {
    doc: GherkinDocument | null;
    errors: string[];
}

let _counter = 0;
const newId = (): string => String(_counter++);

export function parseSource(source: string): ParseResult {
    const errors: string[] = [];
    let doc: GherkinDocument | null = null;

    const envelopes = generateMessages(
        source,
        'anonymous.feature',
        SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
        { newId, includeSource: false, includeGherkinDocument: true, includePickles: false },
    );

    for (const envelope of envelopes) {
        if (envelope.gherkinDocument) {
            doc = envelope.gherkinDocument;
        }
        if (envelope.parseError) {
            errors.push(envelope.parseError.message ?? 'Parse error');
        }
    }

    return { doc, errors };
}

export class GherkinParseCache {
    private cache = new Map<string, { version: number; result: ParseResult }>();

    parse(document: Pick<vscode.TextDocument, 'uri' | 'version' | 'getText'>): ParseResult {
        const key = document.uri.fsPath;
        const cached = this.cache.get(key);
        if (cached?.version === document.version) {
            return cached.result;
        }
        const result = parseSource(document.getText());
        this.cache.set(key, { version: document.version, result });
        return result;
    }

    invalidate(uri: Pick<vscode.Uri, 'fsPath'>): void {
        this.cache.delete(uri.fsPath);
    }
}
