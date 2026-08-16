// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Computes the shape of the test tree from a discovery payload.
//
// Returns plain nodes. Turning them into whatever the host uses to display a
// tree — TestItems, for a VS Code host — is the host's job.

import * as path from 'path';
import type { DiscoveredTestItem, DiscoveredTestNode } from '../protocol/types';

export interface TreeNodeRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

export interface TreeNodeUri {
    /** Resolved against the run's working directory unless `absolute` is set. */
    path: string;
    absolute?: boolean;
}

export interface TreeNode {
    id: string;
    label: string;
    uri: TreeNodeUri;
    canResolveChildren: boolean;
    tags: string[];
    description?: string;
    range?: TreeNodeRange;
    children: TreeNode[];
}

export interface BuiltTree {
    roots: TreeNode[];
    /** Leaf node id → pytest runID. Hosts index their own items from this. */
    idToRunId: Map<string, string>;
}

function toSentenceCase(s: string): string {
    const spaced = s.replace(/_/g, ' ');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isTestItem(node: DiscoveredTestNode | DiscoveredTestItem): node is DiscoveredTestItem {
    return node.type_ === 'test';
}

function collectLeaves(node: DiscoveredTestNode | DiscoveredTestItem): DiscoveredTestItem[] {
    if (isTestItem(node)) return [node];
    const results: DiscoveredTestItem[] = [];
    for (const child of node.children) {
        results.push(...collectLeaves(child));
    }
    return results;
}

/** pytest reports line numbers 1-based, and as a string in some payloads. */
function toRange(lineno: number | string | undefined): TreeNodeRange | undefined {
    const n = typeof lineno === 'string' ? parseInt(lineno, 10) : lineno;
    if (n === undefined || !Number.isFinite(n) || n <= 0) return undefined;
    return { start: { line: n - 1, character: 0 }, end: { line: n, character: 0 } };
}

function findChild(children: TreeNode[], id: string): TreeNode | undefined {
    return children.find((c) => c.id === id);
}

/**
 * Ensure a folder chain exists, returning the children array of the deepest one.
 * An empty `parts` yields the roots, which is how a .feature file sitting at the
 * workspace root is handled.
 */
function ensureFolderPath(roots: TreeNode[], parts: string[]): TreeNode[] {
    let children = roots;
    for (const part of parts) {
        let existing = findChild(children, part);
        if (!existing) {
            existing = {
                id: part,
                label: `${toSentenceCase(part)} 🗂`,
                // Note: only the segment, not the accumulated path. A nested folder
                // therefore claims <cwd>/<segment> rather than its true location.
                // Preserved deliberately — changing it is a separate fix.
                uri: { path: part },
                canResolveChildren: true,
                tags: [],
                children: [],
            };
            children.push(existing);
        }
        children = existing.children;
    }
    return children;
}

/**
 * Build the tree.
 *
 * BDD items — those carrying `feature_path` — are organised under a hierarchy
 * mirroring the .feature file layout. Anything else falls back to a flat
 * file-based hierarchy.
 */
export function buildTestTree(rootNode: DiscoveredTestNode): BuiltTree {
    const roots: TreeNode[] = [];
    const idToRunId = new Map<string, string>();

    const leaves = collectLeaves(rootNode);
    const bddLeaves = leaves.filter((l) => l.feature_path !== undefined);
    const plainLeaves = leaves.filter((l) => l.feature_path === undefined);

    for (const leaf of bddLeaves) {
        const featurePath = leaf.feature_path!;
        const scenarioName = leaf.scenario_name ?? leaf.name;

        const parsed = path.parse(featurePath);
        const dirParts = parsed.dir ? parsed.dir.split('/') : [];
        const folderChildren = ensureFolderPath(roots, dirParts);

        let featureFile = findChild(folderChildren, featurePath);
        if (!featureFile) {
            const featureTags = leaf.feature_tags ?? [];
            featureFile = {
                id: featurePath,
                label: `${leaf.feature_name ?? toSentenceCase(parsed.name)} 🗒`,
                uri: { path: featurePath },
                canResolveChildren: true,
                tags: [...featureTags],
                ...(featureTags.length
                    ? { description: featureTags.map((t) => `@${t}`).join(' ') }
                    : {}),
                children: [],
            };
            folderChildren.push(featureFile);
        }

        const scenarioTags = leaf.scenario_tags ?? [];
        const id = `${featurePath}::${scenarioName}`;
        const range = toRange(leaf.lineno);
        featureFile.children.push({
            id,
            label: scenarioName,
            uri: { path: featurePath },
            canResolveChildren: false,
            tags: [...(leaf.feature_tags ?? []), ...scenarioTags],
            ...(scenarioTags.length
                ? { description: scenarioTags.map((t) => `@${t}`).join(' ') }
                : {}),
            ...(range ? { range } : {}),
            children: [],
        });

        idToRunId.set(id, leaf.runID);
    }

    for (const leaf of plainLeaves) {
        const filePath = leaf.path;

        let fileNode = roots.find((n) => n.uri.absolute && n.uri.path === filePath);
        if (!fileNode) {
            fileNode = {
                id: filePath,
                label: path.basename(filePath),
                uri: { path: filePath, absolute: true },
                canResolveChildren: true,
                tags: [],
                children: [],
            };
            roots.push(fileNode);
        }

        const range = toRange(leaf.lineno);
        fileNode.children.push({
            id: leaf.id_,
            label: leaf.name,
            uri: { path: filePath, absolute: true },
            canResolveChildren: false,
            tags: [],
            ...(range ? { range } : {}),
            children: [],
        });

        idToRunId.set(leaf.id_, leaf.runID);
    }

    return { roots, idToRunId };
}
