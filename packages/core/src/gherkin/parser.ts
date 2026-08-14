// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.

import { generateMessages } from '@cucumber/gherkin';
import { SourceMediaType } from '@cucumber/messages';
import type { GherkinDocument } from '@cucumber/messages';

export interface ParseResult {
    doc: GherkinDocument | null;
    errors: string[];
}

/**
 * The minimum a host must supply to be cacheable: a stable identity, a version
 * that changes when the text changes, and the text itself.
 *
 * VS Code's TextDocument satisfies this structurally, which is why the cache
 * previously took `Pick<vscode.TextDocument, …>` — the coupling was never real.
 */
export interface CacheableDocument {
    readonly uri: { readonly fsPath: string };
    readonly version: number;
    getText(): string;
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

    parse(document: CacheableDocument): ParseResult {
        const key = document.uri.fsPath;
        const cached = this.cache.get(key);
        if (cached?.version === document.version) {
            return cached.result;
        }
        const result = parseSource(document.getText());
        this.cache.set(key, { version: document.version, result });
        return result;
    }

    invalidate(uri: { fsPath: string }): void {
        this.cache.delete(uri.fsPath);
    }
}
