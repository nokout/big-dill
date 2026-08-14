import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'nokout.big-dill';

function fixture(...parts: string[]): vscode.Uri {
    // Compiled to dist/test/, so the fixture lives two levels up in src/.
    return vscode.Uri.file(
        path.resolve(__dirname, '..', '..', 'src', 'test', 'fixtures', 'workspace', ...parts),
    );
}

/** Poll until *predicate* holds or the timeout elapses. */
async function waitFor<T>(
    produce: () => T,
    predicate: (value: T) => boolean,
    timeoutMs = 20000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let latest = produce();
    while (Date.now() < deadline) {
        if (predicate(latest)) return latest;
        await new Promise((r) => setTimeout(r, 250));
        latest = produce();
    }
    return latest;
}

suite('Extension integration', () => {
    suiteSetup(async function () {
        this.timeout(120000);
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(ext, `extension ${EXTENSION_ID} not found in the test host`);
        await ext.activate();
    });

    test('activates in a workspace containing feature files', () => {
        const ext = vscode.extensions.getExtension(EXTENSION_ID);
        assert.strictEqual(ext?.isActive, true, 'extension should be active');
    });

    // The restricted target environment cannot reach the Marketplace, so it has no
    // Python extension. .vscode-test.mjs deliberately installs none, which makes the
    // whole suite above a no-ms-python test — this asserts that condition explicitly
    // so the guarantee cannot be lost by someone re-adding installExtensions.
    test('activates without the Python extension present', () => {
        assert.strictEqual(
            vscode.extensions.getExtension('ms-python.python'),
            undefined,
            'ms-python must not be installed in the test host — it is an optional dependency',
        );
        assert.strictEqual(vscode.extensions.getExtension(EXTENSION_ID)?.isActive, true);
    });

    test('exposes big-dill.pythonPath for interpreter selection without ms-python', () => {
        const config = vscode.workspace.getConfiguration('big-dill');
        const inspected = config.inspect<string>('pythonPath');
        assert.ok(inspected, 'big-dill.pythonPath must be a contributed setting');
        assert.strictEqual(
            inspected.defaultValue,
            '',
            'default must be empty so ms-python, then PATH, remain the fallbacks',
        );
    });

    test('registers the Gherkin language for .feature files', async () => {
        const doc = await vscode.workspace.openTextDocument(fixture('features', 'sample.feature'));
        assert.strictEqual(doc.languageId, 'feature');
    });

    test('publishes structural lint diagnostics for an opened feature file', async () => {
        const uri = fixture('features', 'sample.feature');
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);

        // The fixture references <missing> with only a 'present' column, which
        // checkUndefinedExampleColumn reports as an error.
        const diagnostics = await waitFor(
            () => vscode.languages.getDiagnostics(uri),
            (d) => d.some((x) => /no Examples column/i.test(x.message)),
        );

        const undefinedColumn = diagnostics.find((d) => /no Examples column/i.test(d.message));
        assert.ok(
            undefinedColumn,
            `expected an undefined-column diagnostic, got: ${JSON.stringify(
                diagnostics.map((d) => d.message),
            )}`,
        );
        assert.strictEqual(undefinedColumn.severity, vscode.DiagnosticSeverity.Error);
    });

    test('provides document symbols for a feature file', async () => {
        const doc = await vscode.workspace.openTextDocument(fixture('features', 'sample.feature'));
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            doc.uri,
        );
        assert.ok(symbols && symbols.length > 0, 'expected at least one document symbol');
    });
});
