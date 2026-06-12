import * as vscode from 'vscode';
import * as path from 'path';
import { StepCache } from './stepCache';
import { StepDefinition } from './testController/types';

export enum GroupingMode {
    ByFile = 'file',
    ByStepType = 'stepType',
    ByTag = 'tag',
}

export class StepBrowserItem extends vscode.TreeItem {
    stepDefinition?: StepDefinition;

    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        stepDef?: StepDefinition,
    ) {
        super(label, collapsibleState);
        this.stepDefinition = stepDef;
        if (stepDef) {
            this.tooltip = stepDef.summary || stepDef.pattern;
            this.description = stepDef.keyword;
            this.contextValue = 'stepItem';
            if (stepDef.file && stepDef.line !== undefined) {
                this.command = {
                    command: 'vscode.open',
                    title: 'Go to definition',
                    arguments: [
                        vscode.Uri.file(stepDef.file),
                        { selection: new vscode.Range(stepDef.line - 1, 0, stepDef.line - 1, 0) },
                    ],
                };
            }
        } else {
            this.contextValue = 'stepGroup';
        }
    }
}

export class StepBrowserProvider implements vscode.TreeDataProvider<StepBrowserItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<StepBrowserItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private groupingMode: GroupingMode = GroupingMode.ByFile;
    private filterText: string = '';

    constructor(private readonly cache: StepCache) {}

    setGroupingMode(mode: GroupingMode): void {
        this.groupingMode = mode;
        this._onDidChangeTreeData.fire();
    }

    getGroupingMode(): GroupingMode {
        return this.groupingMode;
    }

    setFilter(text: string): void {
        this.filterText = text.toLowerCase().trim();
        this._onDidChangeTreeData.fire();
    }

    getFilter(): string {
        return this.filterText;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StepBrowserItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StepBrowserItem): Promise<StepBrowserItem[]> {
        const allSteps = this.cache.getAll();

        if (allSteps.length === 0) {
            if (element) return [];
            return [new StepBrowserItem('Awaiting discovery...', vscode.TreeItemCollapsibleState.None)];
        }

        if (element?.stepDefinition) return [];

        const visibleSteps = this.filterText
            ? allSteps.filter(s => s.pattern.toLowerCase().includes(this.filterText))
            : allSteps;

        if (visibleSteps.length === 0) {
            if (element) return [];
            return [new StepBrowserItem(`No steps match "${this.filterText}"`, vscode.TreeItemCollapsibleState.None)];
        }

        if (!element) {
            return this.buildGroups(visibleSteps);
        }

        return this.buildStepItems(visibleSteps, element.label as string);
    }

    private buildGroups(steps: StepDefinition[]): StepBrowserItem[] {
        switch (this.groupingMode) {
            case GroupingMode.ByFile:
                return this.groupsByFile(steps);
            case GroupingMode.ByStepType:
                return this.groupsByStepType(steps);
            case GroupingMode.ByTag:
                return this.groupsByTag(steps);
        }
    }

    private groupsByFile(steps: StepDefinition[]): StepBrowserItem[] {
        const fileMap = new Map<string, StepDefinition[]>();
        for (const step of steps) {
            const key = step.file ? path.basename(step.file) : '(unknown file)';
            if (!fileMap.has(key)) fileMap.set(key, []);
            fileMap.get(key)!.push(step);
        }
        return Array.from(fileMap.keys())
            .sort()
            .map(k => new StepBrowserItem(k, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private groupsByStepType(steps: StepDefinition[]): StepBrowserItem[] {
        const typeMap = new Map<string, StepDefinition[]>();
        for (const step of steps) {
            const types = step.param_types && step.param_types.length > 0
                ? step.param_types
                : ['(no type)'];
            for (const t of types) {
                if (!typeMap.has(t)) typeMap.set(t, []);
                typeMap.get(t)!.push(step);
            }
        }
        return Array.from(typeMap.keys())
            .sort()
            .map(k => new StepBrowserItem(k, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private groupsByTag(steps: StepDefinition[]): StepBrowserItem[] {
        const tagMap = new Map<string, StepDefinition[]>();
        for (const step of steps) {
            const tags = step.tags && step.tags.length > 0
                ? step.tags.map(t => `@${t}`)
                : ['(untagged)'];
            for (const tag of tags) {
                if (!tagMap.has(tag)) tagMap.set(tag, []);
                tagMap.get(tag)!.push(step);
            }
        }
        return Array.from(tagMap.keys())
            .sort()
            .map(k => new StepBrowserItem(k, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private buildStepItems(steps: StepDefinition[], groupLabel: string): StepBrowserItem[] {
        let filtered: StepDefinition[];

        switch (this.groupingMode) {
            case GroupingMode.ByFile: {
                filtered = steps.filter(s =>
                    (s.file ? path.basename(s.file) : '(unknown file)') === groupLabel,
                );
                break;
            }
            case GroupingMode.ByStepType: {
                filtered = steps.filter(s => {
                    if (groupLabel === '(no type)') {
                        return !s.param_types || s.param_types.length === 0;
                    }
                    return s.param_types?.includes(groupLabel) ?? false;
                });
                break;
            }
            case GroupingMode.ByTag: {
                filtered = steps.filter(s => {
                    if (groupLabel === '(untagged)') {
                        return !s.tags || s.tags.length === 0;
                    }
                    return s.tags?.includes(groupLabel.replace(/^@/, '')) ?? false;
                });
                break;
            }
        }

        return filtered
            .sort((a, b) => a.pattern.localeCompare(b.pattern))
            .map(s => new StepBrowserItem(
                s.pattern,
                vscode.TreeItemCollapsibleState.None,
                s,
            ));
    }
}
