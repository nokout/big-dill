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
    // Re-baselined when the engine moved to @nokout/big-dill-core (it fell to
    // 51.7/46.3/46.9/53.1 — composition, not regression), then ratcheted back up
    // once buildTree gained characterisation tests: 70.96/60.22/66.14/73.17.
    // Floors sit just under. What is left uncovered is adapter and registration
    // code, which mock-based tests cover poorly by nature; the honest check for
    // that layer is the integration suite, not this number.
    coverageThreshold: {
        global: {
            statements: 69,
            branches: 58,
            functions: 64,
            lines: 71,
        },
    },
};
