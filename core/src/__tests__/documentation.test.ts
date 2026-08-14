import { renderStepMarkdown } from '../steps/documentation';
import type { StepDefinition } from '../protocol/types';

const base: StepDefinition = {
    keyword: 'given',
    pattern: 'the state is {state}',
    parameters: [],
};

describe('renderStepMarkdown', () => {
    it('always leads with the pattern in bold code', () => {
        expect(renderStepMarkdown(base)).toBe('**`the state is {state}`**');
    });

    it('includes the docstring summary when present', () => {
        expect(renderStepMarkdown({ ...base, summary: 'Set the current state.' }))
            .toContain('Set the current state.');
    });

    it('lists parameters with their type and suggested values', () => {
        const md = renderStepMarkdown({
            ...base,
            parameters: [{
                name: 'state',
                type_name: 'AustralianState',
                suggested_values: ['NSW', 'VIC'],
                has_validator: true,
            }],
        });
        expect(md).toContain('**Parameters:**');
        expect(md).toContain('- `{state}` — **AustralianState**: NSW, VIC');
    });

    it('says so explicitly when a parameter has no suggested values', () => {
        const md = renderStepMarkdown({
            ...base,
            parameters: [{ name: 'n', type_name: 'int', suggested_values: [], has_validator: false }],
        });
        expect(md).toContain('_(no suggested values)_');
    });

    it('renders tags with an @ prefix', () => {
        expect(renderStepMarkdown({ ...base, tags: ['auth', 'smoke'] }))
            .toContain('**Tags:** `@auth` `@smoke`');
    });

    it('shows the definition location, with the line when known', () => {
        expect(renderStepMarkdown({ ...base, file: '/a/steps.py', line: 12 }))
            .toContain('_Defined in `/a/steps.py:12`_');
        expect(renderStepMarkdown({ ...base, file: '/a/steps.py' }))
            .toContain('_Defined in `/a/steps.py`_');
    });

    it('omits empty sections rather than rendering bare headings', () => {
        const md = renderStepMarkdown({ ...base, tags: [], parameters: [] });
        expect(md).not.toContain('Parameters:');
        expect(md).not.toContain('Tags:');
        expect(md).not.toContain('Defined in');
    });

    it('separates sections with a blank line', () => {
        const md = renderStepMarkdown({ ...base, summary: 'Does a thing.', tags: ['x'] });
        expect(md.split('\n\n').length).toBeGreaterThan(2);
    });
});
