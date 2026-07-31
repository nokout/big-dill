import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    label: 'integration',
    files: 'dist/test/**/*.test.js',
    workspaceFolder: './src/test/fixtures/workspace',
    // The extension declares ms-python.python in extensionDependencies, so VS Code
    // refuses to activate it unless the dependency is present.
    installExtensions: ['ms-python.python'],
    mocha: {
        ui: 'tdd',
        timeout: 60000,
    },
});
