import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    label: 'integration',
    files: 'dist/test/**/*.test.js',
    workspaceFolder: './src/test/fixtures/workspace',
    // Deliberately no installExtensions. ms-python is optional, so the whole
    // integration suite runs in the configuration the restricted target
    // environment actually has: no Python extension present. This also removes
    // the only Marketplace fetch from the test run.
    mocha: {
        ui: 'tdd',
        timeout: 60000,
    },
});
