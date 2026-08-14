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
    // This number has reached the end of its usefulness for this package, and the
    // history explains why: 62% before the split, then 51.7 / 71.0 / 67.9 / 58.5 /
    // 54.1 as logic left for core with its tests, and now 36.3. What remains here
    // is almost entirely adapter code — mapping plain values onto editor types and
    // registering providers — which mock-based unit tests cover poorly by nature,
    // since they end up asserting against the mock rather than the editor.
    //
    // Core, which holds the logic, sits at 92% over 189 tests and is where a
    // coverage floor still means something. These floors are kept only to catch a
    // wholesale deletion of the remaining tests; the honest check for this layer
    // is the integration suite running against real VS Code, and expanding it is
    // tracked work rather than something this number should be used to fake.
    coverageThreshold: {
        global: {
            statements: 35,
            branches: 34,
            functions: 34,
            lines: 36,
        },
    },
};
