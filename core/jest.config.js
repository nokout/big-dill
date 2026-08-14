/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    // Deliberately no moduleNameMapper for 'vscode'. This package must never
    // import the editor API, and the absence of a mock is what enforces it —
    // an accidental `import … from 'vscode'` fails to resolve rather than
    // silently binding to a hand-written stub.
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/__tests__/**',
        '!src/index.ts',
        // Process orchestration: spawns pytest and talks to it over a pipe. Unit
        // tests here would assert against a fake subprocess and prove little; it
        // is covered end-to-end by the playground job in CI, which runs real
        // discovery, execution and linting.
        '!src/pytest/runner.ts',
    ],
    // Set just under the measured baseline (87.9 / 71.0 / 87.7 / 88.0). This
    // package is pure functions, so it should stay high — treat a drop here as a
    // real regression rather than noise, and ratchet up as coverage grows.
    coverageThreshold: {
        global: {
            statements: 86,
            branches: 69,
            functions: 86,
            lines: 86,
        },
    },
};
