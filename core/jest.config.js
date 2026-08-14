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
    collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**', '!src/index.ts'],
    // Set just under the measured baseline (85.6 / 66.5 / 85.3 / 85.8). This
    // package is pure functions, so it should stay high — treat a drop here as a
    // real regression rather than noise, and ratchet up as coverage grows.
    coverageThreshold: {
        global: {
            statements: 84,
            branches: 64,
            functions: 83,
            lines: 84,
        },
    },
};
