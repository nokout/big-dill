/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^vscode$': '<rootDir>/__mocks__/vscode.ts',
        // Resolve the core package from source rather than its built dist, so a
        // stale build cannot mask a break. Publishing is verified separately by
        // installing the packed tarball.
        '^@nokout/big-dill-core$': '<rootDir>/../core/src/index.ts',
    },
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/__tests__/**',
        // Integration tests run in a real VS Code via @vscode/test-cli, not Jest,
        // so counting them here would report them as 0% covered.
        '!src/test/**',
        // Activation wiring — exercised by those integration tests, not unit tests.
        '!src/extension.ts',
    ],
    // This number moves every time logic leaves for core, and the movement is
    // composition rather than regression: 62 before the split, 51.7 after the
    // first extraction, 71.0 once buildTree gained characterisation tests, and
    // 58.5 once the tree logic and the pure provider halves moved out, taking
    // their tests with them (core holds 90.6% over 150 tests). Floors sit just
    // under the current measurement. What is left
    // uncovered here is adapter and registration code, which mock-based tests
    // cover poorly by nature; the honest check for that layer is the integration
    // suite, not this number.
    coverageThreshold: {
        global: {
            statements: 57,
            branches: 49,
            functions: 48,
            lines: 59,
        },
    },
};
