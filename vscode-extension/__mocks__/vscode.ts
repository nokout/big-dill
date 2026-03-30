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
