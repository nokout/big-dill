import * as vscode from 'vscode';
import { runBddLint } from './testController/pytestRunner';

export class FeatureDiagnostics {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly getWorkspaceUri: () => vscode.Uri | undefined,
        private readonly getInterpreter: (uri: vscode.Uri) => Promise<string>,
    ) {
        this.collection = vscode.languages.createDiagnosticCollection('pytest-bdd-orama');
    }

    /** Schedule a lint run for *uri* (debounced, 300 ms). Called on document save. */
    schedule(uri: vscode.Uri): void {
        const key = uri.fsPath;
        const existing = this.pending.get(key);
        if (existing) clearTimeout(existing);
        this.pending.set(key, setTimeout(() => { void this.lint(uri); }, 300));
    }

    private async lint(uri: vscode.Uri): Promise<void> {
        const workspaceUri = this.getWorkspaceUri();
        if (!workspaceUri) return;

        const interpreterPath = await this.getInterpreter(workspaceUri);
        let entries;
        try {
            entries = await runBddLint(uri.fsPath, workspaceUri, interpreterPath);
        } catch {
            return;  // subprocess error — don't clear existing diagnostics
        }

        const diagnostics: vscode.Diagnostic[] = entries.map((e) => {
            const line = Math.max(0, (e.line ?? 1) - 1);
            const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
            const severity =
                e.severity === 'error' ? vscode.DiagnosticSeverity.Error :
                e.severity === 'warning' ? vscode.DiagnosticSeverity.Warning :
                vscode.DiagnosticSeverity.Information;
            return new vscode.Diagnostic(range, e.message, severity);
        });

        this.collection.set(uri, diagnostics);
    }

    dispose(): void {
        this.collection.dispose();
        for (const t of this.pending.values()) clearTimeout(t);
        this.pending.clear();
    }
}
