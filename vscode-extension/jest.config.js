/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^vscode$': '<rootDir>/__mocks__/vscode.ts',
        // Resolve the core package from source rather than its built dist, so a
        // stale build cannot mask a break. Publishing is verified separately by
        // installing the packed tarball.
        '^@nokout/big-dill-core$': '<rootDir>/../packages/core/src/index.ts',
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
    // Re-baselined when the engine moved to @nokout/big-dill-core. Coverage fell
    // from 62/52/60/63 to 51.7/46.3/46.9/53.1 — not a regression: the pure logic
    // that was propping these numbers up now lives in core, which holds itself to
    // a much higher floor. What remains here is adapter and registration code,
    // which mock-based unit tests cover poorly by nature. The honest check for
    // this layer is the integration suite, not this number.
    coverageThreshold: {
        global: {
            statements: 50,
            branches: 44,
            functions: 45,
            lines: 51,
        },
    },
};
