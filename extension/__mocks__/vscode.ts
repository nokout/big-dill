// Minimal vscode mock for Jest unit tests.
// Only exports used as runtime values in testController/ are mocked here;
// type-only imports (TestController, TestItem, etc.) need no runtime mock.

export const TestMessage = jest.fn().mockImplementation((message: string) => ({ message }));

export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn(() => []),
    })),
    onDidOpenTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidChangeTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
    onDidCloseTextDocument: jest.fn(() => ({ dispose: jest.fn() })),
};

// Stub the remaining named exports so TypeScript's import resolution is happy
// without needing to wire up the full VSCode API.
export const Uri = {
    file: jest.fn((p: string) => ({ fsPath: p, toString: () => p })),
    // Real enough to build tree paths with. Previously a bare jest.fn() returning
    // undefined, which is part of why buildTree had no tests.
    joinPath: jest.fn((base: { fsPath: string }, ...parts: string[]) => {
        const joined = [base.fsPath, ...parts].join('/').replace(/\/+/g, '/');
        return { fsPath: joined, toString: () => joined };
    }),
};
export const Position = jest
    .fn()
    .mockImplementation((line: number, character: number) => ({ line, character }));
// vscode.Range has two overloads: (start: Position, end: Position) and
// (startLine, startChar, endLine, endChar). Support both, or code using the
// numeric form silently produces a nonsense range.
export const Range = jest.fn().mockImplementation((...args: unknown[]) => {
    if (args.length === 4) {
        const [sl, sc, el, ec] = args as number[];
        return { start: { line: sl, character: sc }, end: { line: el, character: ec } };
    }
    const [start, end] = args;
    return { start, end };
});
export const TestTag = jest.fn().mockImplementation((id: string) => ({ id }));
export const CancellationToken = {};

// Completion API mocks
export const CompletionItemKind = {
    Snippet: 14,
    EnumMember: 19,
};

export class SnippetString {
    value: string;
    constructor(value: string) {
        this.value = value;
    }
}

export class CompletionItem {
    label: string;
    kind?: number;
    insertText?: string | SnippetString;
    detail?: string;
    constructor(label: string, kind?: number) {
        this.label = label;
        this.kind = kind;
    }
}

export class SemanticTokensLegend {
    tokenTypes: string[];
    tokenModifiers: string[];
    constructor(tokenTypes: string[], tokenModifiers: string[]) {
        this.tokenTypes = tokenTypes;
        this.tokenModifiers = tokenModifiers;
    }
}

export class SemanticTokensBuilder {
    private entries: Array<{ line: number; char: number; len: number; type: number; mod: number }> = [];
    constructor(public legend?: SemanticTokensLegend) {}
    push(line: number, char: number, len: number, type: number, mod: number): void {
        this.entries.push({ line, char, len, type, mod });
    }
    build() { return { data: this.entries }; }
}

export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

export class Diagnostic {
    constructor(
        public range: any,
        public message: string,
        public severity?: number,
    ) {}
}

export const languages = {
    createDiagnosticCollection: jest.fn(() => ({
        set: jest.fn(),
        delete: jest.fn(),
        dispose: jest.fn(),
    })),
    registerDocumentSemanticTokensProvider: jest.fn(),
    registerDocumentFormattingEditProvider: jest.fn(),
    registerDocumentSymbolProvider: jest.fn(),
};

export const TextEdit = {
    replace: jest.fn((range: any, newText: string) => ({ range, newText })),
};

export const SymbolKind = {
    File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4,
    Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9,
    Interface: 10, Function: 11, Variable: 12, Constant: 13,
    String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18,
    Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23,
    Operator: 24, TypeParameter: 25,
};

export class DocumentSymbol {
    children: DocumentSymbol[] = [];
    constructor(
        public name: string,
        public detail: string,
        public kind: number,
        public range: any,
        public selectionRange: any,
    ) {}
}

export class MarkdownString {
    value: string;
    isTrusted?: boolean;
    constructor(value = '') {
        this.value = value;
    }
    appendMarkdown(text: string): this {
        this.value += text;
        return this;
    }
    appendCodeblock(text: string, language?: string): this {
        this.value += `\`\`\`${language ?? ''}\n${text}\n\`\`\`\n`;
        return this;
    }
}

export class Hover {
    contents: MarkdownString[];
    range?: unknown;
    constructor(contents: MarkdownString | MarkdownString[], range?: unknown) {
        this.contents = Array.isArray(contents) ? contents : [contents];
        this.range = range;
    }
}

export class Location {
    uri: unknown;
    range: unknown;
    constructor(uri: unknown, range: unknown) {
        this.uri = uri;
        this.range = range;
    }
}

export class CodeAction {
    title: string;
    edit?: unknown;
    diagnostics?: unknown[];
    kind?: string;
    constructor(title: string, kind?: string) {
        this.title = title;
        this.kind = kind;
    }
}

export const CodeActionKind = {
    QuickFix: 'quickfix',
    Refactor: 'refactor',
};

export class WorkspaceEdit {
    private _edits: Array<{ uri: unknown; range: unknown; newText: string }> = [];
    replace(uri: unknown, range: unknown, newText: string): void {
        this._edits.push({ uri, range, newText });
    }
    insert(uri: unknown, position: unknown, text: string): void {
        this._edits.push({ uri, range: position, newText: text });
    }
    getEdits(): Array<{ uri: unknown; range: unknown; newText: string }> {
        return this._edits;
    }
}

export class TreeItem {
    label: string;
    collapsibleState?: number;
    description?: string;
    tooltip?: string;
    command?: unknown;
    contextValue?: string;
    constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
    }
}

export const TreeItemCollapsibleState = {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
};

export class EventEmitter<T = void> {
    private listeners: Array<(e: T) => void> = [];
    readonly event = (listener: (e: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data: T): void {
        this.listeners.forEach(l => l(data));
    }
    dispose(): void {
        this.listeners = [];
    }
}
