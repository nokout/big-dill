// In-memory stand-ins for the VS Code Testing API, sufficient to assert the
// shape of a built test tree.
//
// These live under src/ rather than in __mocks__/vscode.ts because tsconfig's
// rootDir is src: a test importing them from outside it fails typecheck. The
// module mock keeps only the vscode API surface; the fakes are test fixtures.

export interface FakeTestItem {
    id: string;
    label: string;
    uri?: { fsPath: string };
    children: FakeTestItemCollection;
    tags: { id: string }[];
    range?: unknown;
    description?: string;
    canResolveChildren: boolean;
}

export class FakeTestItemCollection {
    private readonly map = new Map<string, FakeTestItem>();
    get size(): number { return this.map.size; }
    add(item: FakeTestItem): void { this.map.set(item.id, item); }
    delete(id: string): void { this.map.delete(id); }
    get(id: string): FakeTestItem | undefined { return this.map.get(id); }
    forEach(fn: (item: FakeTestItem) => void): void { this.map.forEach((v) => fn(v)); }
    /** Test-only convenience, not part of the real API. */
    all(): FakeTestItem[] { return [...this.map.values()]; }
}

export function createFakeTestController(): {
    items: FakeTestItemCollection;
    createTestItem: (id: string, label: string, uri?: { fsPath: string }) => FakeTestItem;
} {
    return {
        items: new FakeTestItemCollection(),
        createTestItem: (id, label, uri) => ({
            id,
            label,
            uri,
            children: new FakeTestItemCollection(),
            tags: [],
            canResolveChildren: false,
        }),
    };
}

// Completion API mocks
