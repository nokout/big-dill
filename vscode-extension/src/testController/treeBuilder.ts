// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// BDD-ORAMA: New file — builds a feature-path-based TestItem tree from the
// DiscoveredTestPayload produced by vscode_pytest/__init__.py.

import * as path from 'path';
import { Position, Range, TestController, TestItem, Uri } from 'vscode';
import { DiscoveredTestItem, DiscoveredTestNode, IBddTestItemIndex } from './types';

export const RunTestTag = { id: 'pytest-bdd-run' };
export const DebugTestTag = { id: 'pytest-bdd-debug' };

function toSentenceCase(s: string): string {
    const spaced = s.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isTestItem(node: DiscoveredTestNode | DiscoveredTestItem): node is DiscoveredTestItem {
    return node.type_ === 'test';
}

/**
 * Collect all leaf test items from a DiscoveredTestNode tree.
 */
function collectLeaves(node: DiscoveredTestNode | DiscoveredTestItem): DiscoveredTestItem[] {
    if (isTestItem(node)) {
        return [node];
    }
    const results: DiscoveredTestItem[] = [];
    for (const child of node.children) {
        results.push(...collectLeaves(child));
    }
    return results;
}

/**
 * Ensure a folder TestItem exists at `parts[0..depth]` under `parent`.
 * Returns the TestItem for the deepest folder.
 */
function ensureFolderPath(
    testController: TestController,
    parent: TestItem | TestController,
    parts: string[],
    baseUri: Uri,
): TestItem {
    let current: TestItem | undefined;
    let children: typeof testController.items =
        'items' in parent ? parent.items : (parent as TestItem).children;

    for (const part of parts) {
        const id = part; // folder id is just the path segment label at this level
        let existing: TestItem | undefined;
        children.forEach((item) => {
            if (item.id === id) {
                existing = item;
            }
        });
        if (!existing) {
            const folderUri = Uri.joinPath(baseUri, part);
            existing = testController.createTestItem(id, `${toSentenceCase(part)} 🗂`, folderUri);
            existing.canResolveChildren = true;
            existing.tags = [RunTestTag, DebugTestTag];
            children.add(existing);
        }
        current = existing;
        children = current.children;
    }
    return current!;
}

/**
 * Build (or rebuild) the feature-path tree under the given TestController.
 *
 * - BDD items (those with feature_path) are organised under a "features/" hierarchy
 *   mirroring the .feature file directory layout.
 * - Non-BDD items are placed under a flat file-path hierarchy (standard behaviour).
 *
 * The `itemIndex` maps are populated so the execution handler can look up TestItems
 * by pytest runID.
 */
export function buildTree(
    testController: TestController,
    rootNode: DiscoveredTestNode,
    cwdUri: Uri,
    itemIndex: IBddTestItemIndex,
): void {
    // Clear existing items
    const toDelete: string[] = [];
    testController.items.forEach((item) => toDelete.push(item.id));
    toDelete.forEach((id) => testController.items.delete(id));
    itemIndex.idToRunId.clear();
    itemIndex.runIdToItem.clear();

    const leaves = collectLeaves(rootNode);

    const bddLeaves = leaves.filter((l) => l.feature_path !== undefined);
    const plainLeaves = leaves.filter((l) => l.feature_path === undefined);

    // --- BDD items: feature-path hierarchy ---
    for (const leaf of bddLeaves) {
        const featurePath = leaf.feature_path!; // e.g. "features/states/basic_states.feature"
        const scenarioName = leaf.scenario_name ?? leaf.name;

        // Split into directory components + filename (without .feature extension)
        const parsed = path.parse(featurePath);
        const dirParts = parsed.dir ? parsed.dir.split('/') : [];
        const featureFileStem = parsed.name; // e.g. "basic_states"

        // Feature file URI (used for "go to definition" navigation)
        const featureFileUri = Uri.joinPath(cwdUri, featurePath);

        // Build folder nodes for each directory component
        const folderNode = ensureFolderPath(testController, testController, dirParts, cwdUri);

        // Feature file node (no extension in label)
        let featureFileItem: TestItem | undefined;
        folderNode.children.forEach((item) => {
            if (item.id === featurePath) {
                featureFileItem = item;
            }
        });
        if (!featureFileItem) {
            const featureId = featurePath; // unique per feature file
            featureFileItem = testController.createTestItem(featureId, `${leaf.feature_name ?? toSentenceCase(featureFileStem)} 🗒`, featureFileUri);
            featureFileItem.canResolveChildren = true;
            featureFileItem.tags = [RunTestTag, DebugTestTag];
            if (leaf.feature_tags?.length) {
                featureFileItem.description = leaf.feature_tags.map((t) => `@${t}`).join(' ');
            }
            folderNode.children.add(featureFileItem);
        }

        // Scenario leaf node
        const lineno = typeof leaf.lineno === 'string' ? parseInt(leaf.lineno, 10) : leaf.lineno;
        const range = Number.isFinite(lineno) && lineno > 0
            ? new Range(new Position(lineno - 1, 0), new Position(lineno, 0))
            : undefined;

        // Leaf id: featurePath + "::" + scenarioName (unique per scenario)
        const leafId = `${featurePath}::${scenarioName}`;
        const scenarioItem = testController.createTestItem(leafId, scenarioName, featureFileUri);
        scenarioItem.canResolveChildren = false;
        scenarioItem.tags = [RunTestTag, DebugTestTag];
        if (leaf.scenario_tags?.length) {
            scenarioItem.description = leaf.scenario_tags.map((t) => `@${t}`).join(' ');
        }
        if (range) {
            scenarioItem.range = range;
        }
        featureFileItem.children.add(scenarioItem);

        // Register in index
        itemIndex.idToRunId.set(leafId, leaf.runID);
        itemIndex.runIdToItem.set(leaf.runID, scenarioItem);
    }

    // --- Non-BDD items: flat file hierarchy ---
    for (const leaf of plainLeaves) {
        const filePath = leaf.path;
        const fileUri = Uri.file(filePath);
        const fileName = path.basename(filePath);

        let fileItem: TestItem | undefined;
        testController.items.forEach((item) => {
            if (item.uri?.fsPath === fileUri.fsPath) {
                fileItem = item;
            }
        });
        if (!fileItem) {
            fileItem = testController.createTestItem(filePath, fileName, fileUri);
            fileItem.canResolveChildren = true;
            fileItem.tags = [RunTestTag, DebugTestTag];
            testController.items.add(fileItem);
        }

        const lineno = typeof leaf.lineno === 'string' ? parseInt(leaf.lineno, 10) : leaf.lineno;
        const range = Number.isFinite(lineno) && lineno > 0
            ? new Range(new Position(lineno - 1, 0), new Position(lineno, 0))
            : undefined;

        const leafItem = testController.createTestItem(leaf.id_, leaf.name, fileUri);
        leafItem.canResolveChildren = false;
        leafItem.tags = [RunTestTag, DebugTestTag];
        if (range) {
            leafItem.range = range;
        }
        fileItem.children.add(leafItem);

        itemIndex.idToRunId.set(leaf.id_, leaf.runID);
        itemIndex.runIdToItem.set(leaf.runID, leafItem);
    }
}
