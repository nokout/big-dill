// Bundles the extension into a single dist/extension.js.
//
// Two separate outputs exist on purpose:
//   dist/  — the bundle, and the only thing that ships (package.json "main")
//   out/   — plain tsc output, used by the integration tests and typecheck
//
// Bundling is what makes npm workspaces viable here: nothing is shipped out of
// node_modules, so hoisting to the monorepo root stops mattering. Unbundled, vsce
// walks up into the root tree and tries to package the whole dev dependency graph.

import * as esbuild from 'esbuild';
import { rmSync } from 'fs';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

// Clean first. A production build emits no sourcemap, so without this a stale map
// from an earlier dev build survives on disk and is packaged into the VSIX —
// where it is larger than every other file combined.
rmSync('dist', { recursive: true, force: true });

/** @type {import('esbuild').BuildOptions} */
const options = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    // The extension host supplies 'vscode' at runtime; it is not installable and
    // must never be bundled. Node builtins are external automatically on this platform.
    external: ['vscode'],
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    sourcemap: !production,
    minify: production,
    logLevel: 'info',
};

if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[esbuild] watching…');
} else {
    await esbuild.build(options);
}
