// Copyright (c) 2026 Nigel O'Keefe. All rights reserved.
// Licensed under the MIT License.
//
// Builds a document outline for a Gherkin file: the feature, with its scenarios
// and background beneath it.
//
// Returns plain nodes carrying a line number; hosts map `kind` onto their own
// symbol vocabulary and turn `line` into whatever range type they use.

import type { GherkinDocument } from '@cucumber/messages';

export type SymbolNodeKind = 'feature' | 'scenario';

export interface SymbolNode {
    name: string;
    /** Secondary text — tags, for scenarios. Empty when there is none. */
    detail: string;
    kind: SymbolNodeKind;
    /** 0-indexed line the symbol starts on. */
    line: number;
    children: SymbolNode[];
}

export function buildSymbolTree(doc: GherkinDocument): SymbolNode[] {
    if (!doc.feature) return [];

    const feature = doc.feature;
    const featureNode: SymbolNode = {
        name: feature.name || '(unnamed feature)',
        detail: '',
        kind: 'feature',
        line: (feature.location?.line ?? 1) - 1,
        children: [],
    };

    for (const child of feature.children) {
        const scenario = child.scenario ?? child.background;
        if (!scenario) continue;

        const tags = ('tags' in scenario ? scenario.tags ?? [] : []).map((t) => t.name).join(' ');

        featureNode.children.push({
            name: scenario.name || (child.background ? '(background)' : '(unnamed scenario)'),
            detail: tags,
            kind: 'scenario',
            line: (scenario.location?.line ?? 1) - 1,
            children: [],
        });
    }

    return [featureNode];
}
