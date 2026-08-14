import { buildStepStub, patternToFunctionName } from '../steps/stubs';

describe('patternToFunctionName', () => {
    test('converts simple pattern to snake_case', () => {
        expect(patternToFunctionName('the user logs in')).toBe('the_user_logs_in');
    });

    test('strips parameter placeholders', () => {
        expect(patternToFunctionName('the state is {state:AustralianState}')).toBe('the_state_is_state');
    });

    test('strips non-word characters', () => {
        expect(patternToFunctionName('user (with spaces) and "quotes"')).toBe('user_with_spaces_and_quotes');
    });
});

describe('buildStepStub', () => {
    test('generates a @given stub for a given step', () => {
        const stub = buildStepStub('the user logs in', 'Given');
        expect(stub).toContain('@given("the user logs in")');
        expect(stub).toContain('def the_user_logs_in():');
        expect(stub).toContain('raise NotImplementedError');
    });

    test('generates a @when stub', () => {
        const stub = buildStepStub('the button is clicked', 'When');
        expect(stub).toContain('@when("the button is clicked")');
        expect(stub).toContain('def the_button_is_clicked():');
    });

    test('generates a @then stub', () => {
        const stub = buildStepStub('the result is shown', 'Then');
        expect(stub).toContain('@then("the result is shown")');
    });

    test('uses @step for And/But/unknown keyword', () => {
        const stub = buildStepStub('something happens', 'And');
        expect(stub).toContain('@step("something happens")');
    });

    test('includes parameter names as function args when pattern has params', () => {
        const stub = buildStepStub('the state is {state:AustralianState}', 'Given');
        expect(stub).toContain('def the_state_is_state(state):');
    });
});
