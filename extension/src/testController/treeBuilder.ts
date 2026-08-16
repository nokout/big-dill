// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Adapter only. The tree shape is computed by @nokout/big-dill-core; this
// materialises it as TestItems and populates the run-id index.

import { Position, Range, TestController, TestItem, TestTag, Uri } from 'vscode';
import { buildTestTree, type TreeNode } from '@nokout/big-dill-core';
import type { DiscoveredTestNode, IBddTestItemIndex } from './types';

/** Resolve a node's uri descriptor against the run's working directory. */
function toUri(node: TreeNode, cwdUri: Uri): Uri {
    return node.uri.absolute ? Uri.file(node.uri.path) : Uri.joinPath(cwdUri, node.uri.path);
}

/** Recursively turn plain nodes into TestItems, wiring the index as it goes. */
function materialise(
    nodes: TreeNode[],
    add: (item: TestItem) => void,
    testController: TestController,
    cwdUri: Uri,
    itemIndex: IBddTestItemIndex,
): void {
    for (const node of nodes) {
        const item = testController.createTestItem(node.id, node.label, toUri(node, cwdUri));
        item.canResolveChildren = node.canResolveChildren;
        item.tags = node.tags.map((t) => new TestTag(t));
        if (node.description !== undefined) {
            item.description = node.description;
        }
        if (node.range) {
            item.range = new Range(
                new Position(node.range.start.line, node.range.start.character),
                new Position(node.range.end.line, node.range.end.character),
            );
        }
        add(item);

        const runId = itemIndex.idToRunId.get(node.id);
        if (runId !== undefined) {
            itemIndex.runIdToItem.set(runId, item);
        }

        materialise(node.children, (child) => item.children.add(child), testController, cwdUri, itemIndex);
    }
}

/**
 * Build (or rebuild) the test tree under the given TestController.
 *
 * The `itemIndex` maps are populated so the execution handler can look up
 * TestItems by pytest runID.
 */
export function buildTree(
    testController: TestController,
    rootNode: DiscoveredTestNode,
    cwdUri: Uri,
    itemIndex: IBddTestItemIndex,
): void {
    const toDelete: string[] = [];
    testController.items.forEach((item) => toDelete.push(item.id));
    toDelete.forEach((id) => testController.items.delete(id));
    itemIndex.idToRunId.clear();
    itemIndex.runIdToItem.clear();

    const { roots, idToRunId } = buildTestTree(rootNode);

    // Seed id→runID first so materialise can fill runID→item as it creates each.
    for (const [id, runId] of idToRunId) {
        itemIndex.idToRunId.set(id, runId);
    }

    materialise(roots, (item) => testController.items.add(item), testController, cwdUri, itemIndex);
}
