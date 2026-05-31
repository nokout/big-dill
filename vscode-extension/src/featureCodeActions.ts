import * as vscode from 'vscode';
import { StepCache } from './stepCache';
import { extractStepText } from './featureCompletion';

const PARAM_RE = /\{(\w+)(?::[^}]+)?\}/g;

/** Convert a step pattern to a Python snake_case function name. */
export function patternToFunctionName(pattern: string): string {
    return pattern
        .replace(new RegExp(PARAM_RE.source, 'g'), '$1')
        .replace(/[^\w\s]/g, ' ')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
}

const KEYWORD_TO_DECORATOR: Record<string, string> = {
    given: 'given',
    when: 'when',
    then: 'then',
};

/**
 * Generate a Python step function stub for *stepText* with the given Gherkin *keyword*.
 */
export function buildStepStub(stepText: string, keyword: string): string {
    const kw = keyword.toLowerCase();
    const decorator = KEYWORD_TO_DECORATOR[kw] ?? 'step';

    const paramNames: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(PARAM_RE.source, 'g');
    while ((m = re.exec(stepText)) !== null) {
        paramNames.push(m[1]);
    }

    const fnName = patternToFunctionName(stepText);
    const fnArgs = paramNames.length > 0 ? `(${paramNames.join(', ')})` : '()';

    return [
        `@${decorator}("${stepText}")`,
        `def ${fnName}${fnArgs}:`,
        `    raise NotImplementedError`,
    ].join('\n');
}

/** VS Code CodeActionProvider for unimplemented step diagnostics. */
export class FeatureCodeActionsProvider implements vscode.CodeActionProvider {
    constructor(private readonly cache: StepCache) {}

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range,
        context: vscode.CodeActionContext,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (!diagnostic.message.startsWith('Step not implemented:')) continue;

            const lineIndex = (diagnostic.range as vscode.Range).start.line;
            const rawLine = document.lineAt(lineIndex).text;
            const stepText = extractStepText(rawLine);
            if (!stepText) continue;

            if (this.cache.matchPattern(stepText.text)) continue;

            const action = new vscode.CodeAction(
                `Generate step stub: "${stepText.text}"`,
                vscode.CodeActionKind.QuickFix,
            );
            action.diagnostics = [diagnostic];

            const stub = buildStepStub(stepText.text, stepText.keyword);
            const stubWithImport = [
                'from pytest_bdd import given, when, then, step',
                '',
                '',
                stub,
                '',
            ].join('\n');

            const edit = new vscode.WorkspaceEdit();
            const newFileUri = vscode.Uri.file(
                document.uri.fsPath.replace(/[^/\\]+\.feature$/, 'steps_stub.py'),
            );
            edit.insert(newFileUri, new vscode.Position(0, 0), stubWithImport);
            action.edit = edit;

            actions.push(action);
        }

        return actions;
    }
}
