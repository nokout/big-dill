// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. Grouping, filtering and ordering live in @nokout/big-dill-core;
// this renders the resulting nodes as TreeItems and wires navigation.

import * as vscode from 'vscode';
import {
    StepCache,
    browseSteps,
    type GroupingMode as CoreGroupingMode,
    type StepBrowserNode,
    type StepDefinition,
} from '@nokout/big-dill-core';

/** String values match core's GroupingMode, so the enum is assignable to it. */
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

function toItem(node: StepBrowserNode): StepBrowserItem {
    return node.kind === 'group'
        ? new StepBrowserItem(node.label, vscode.TreeItemCollapsibleState.Collapsed)
        : new StepBrowserItem(
            node.label,
            vscode.TreeItemCollapsibleState.None,
            node.kind === 'step' ? node.step : undefined,
        );
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
        // A step is a leaf; only groups expand.
        if (element?.stepDefinition) return [];

        const nodes = browseSteps(this.cache.getAll(), {
            mode: this.groupingMode as CoreGroupingMode,
            filter: this.filterText,
            group: element ? (element.label as string) : undefined,
        });

        return nodes.map(toItem);
    }
}
