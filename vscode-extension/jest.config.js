/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^vscode$': '<rootDir>/__mocks__/vscode.ts',
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
    // Floors set just under the current baseline (62/52/60/63) so real regressions
    // fail CI without tripping on small fluctuations. Ratchet up as coverage grows.
    coverageThreshold: {
        global: {
            statements: 60,
            branches: 50,
            functions: 58,
            lines: 61,
        },
    },
};
