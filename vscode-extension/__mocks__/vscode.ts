// Minimal vscode mock for Jest unit tests.
// Only exports used as runtime values in testController/ are mocked here;
// type-only imports (TestController, TestItem, etc.) need no runtime mock.

export const TestMessage = jest.fn().mockImplementation((message: string) => ({ message }));

export const workspace = {
    getConfiguration: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({}),
    }),
};

// Stub the remaining named exports so TypeScript's import resolution is happy
// without needing to wire up the full VSCode API.
export const Uri = {
    file: jest.fn((p: string) => ({ fsPath: p, toString: () => p })),
    joinPath: jest.fn(),
};
export const Position = jest.fn();
export const Range = jest.fn();
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
