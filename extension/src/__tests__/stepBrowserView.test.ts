// Adapter tests: grouping and filtering are core's, verified there. What matters
// here is that plain nodes become TreeItems with the right collapsibility,
// context value, and navigation command — none of which was covered before.

import { StepBrowserProvider, StepBrowserItem, GroupingMode } from '../stepBrowserView';
import { StepCache, type StepDefinition } from '@nokout/big-dill-core';

const WITH_LOCATION: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state}',
    parameters: [],
    file: '/abs/tests/steps/state_steps.py',
    line: 42,
    summary: 'Set the current state.',
    tags: ['geography'],
    param_types: [],
};

const WITHOUT_LOCATION: StepDefinition = {
    keyword: 'when',
    pattern: 'something happens',
    parameters: [],
};

function providerWith(steps: StepDefinition[]): StepBrowserProvider {
    const cache = new StepCache();
    cache.update(steps);
    return new StepBrowserProvider(cache);
}

describe('StepBrowserProvider — TreeItem mapping', () => {
    it('renders groups as collapsible items carrying no step', async () => {
        const [group] = await providerWith([WITH_LOCATION]).getChildren();
        expect(group.collapsibleState).toBe(1); // Collapsed
        expect(group.contextValue).toBe('stepGroup');
        expect(group.stepDefinition).toBeUndefined();
    });

    it('renders steps as leaves carrying their definition', async () => {
        const provider = providerWith([WITH_LOCATION]);
        const [group] = await provider.getChildren();
        const [step] = await provider.getChildren(group);
        expect(step.collapsibleState).toBe(0); // None
        expect(step.contextValue).toBe('stepItem');
        expect(step.stepDefinition?.pattern).toBe('the state is {state}');
    });

    it('uses the summary as tooltip, falling back to the pattern', async () => {
        const provider = providerWith([WITH_LOCATION, WITHOUT_LOCATION]);
        const groups = await provider.getChildren();
        const items = (await Promise.all(groups.map((g) => provider.getChildren(g)))).flat();

        expect(items.find((i) => i.stepDefinition?.file)!.tooltip).toBe('Set the current state.');
        expect(items.find((i) => !i.stepDefinition?.file)!.tooltip).toBe('something happens');
    });

    it('wires a go-to-definition command when the step has a file and line', async () => {
        const provider = providerWith([WITH_LOCATION]);
        const [group] = await provider.getChildren();
        const [step] = await provider.getChildren(group);

        expect(step.command?.command).toBe('vscode.open');
        // line is 1-based in the payload and 0-based in the editor selection
        const [, opts] = step.command!.arguments as [unknown, { selection: { start: { line: number } } }];
        expect(opts.selection.start.line).toBe(41);
    });

    it('omits the command when the step has no location', async () => {
        const provider = providerWith([WITHOUT_LOCATION]);
        const [group] = await provider.getChildren();
        const [step] = await provider.getChildren(group);
        expect(step.command).toBeUndefined();
    });

    it('does not expand a step', async () => {
        const provider = providerWith([WITH_LOCATION]);
        const [group] = await provider.getChildren();
        const [step] = await provider.getChildren(group);
        expect(await provider.getChildren(step)).toEqual([]);
    });

    it('renders the empty-cache placeholder as a plain leaf', async () => {
        const [placeholder] = await providerWith([]).getChildren();
        expect(placeholder.label).toBe('Awaiting discovery...');
        expect(placeholder.collapsibleState).toBe(0);
        expect(placeholder.stepDefinition).toBeUndefined();
    });

    it('tracks grouping mode and filter state', () => {
        const provider = providerWith([WITH_LOCATION]);
        provider.setGroupingMode(GroupingMode.ByTag);
        expect(provider.getGroupingMode()).toBe(GroupingMode.ByTag);
        provider.setFilter('  Hello  ');
        expect(provider.getFilter()).toBe('hello');
    });

    it('constructs a bare item without a step definition', () => {
        const item = new StepBrowserItem('label only', 0);
        expect(item.contextValue).toBe('stepGroup');
        expect(item.command).toBeUndefined();
    });
});
