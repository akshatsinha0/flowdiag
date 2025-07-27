const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const copyWasmPlugin = {
	name: 'copy-wasm',
	setup(build) {
		build.onEnd(() => {
			// Ensure dist/media directory exists
			const distMediaDir = path.join(__dirname, 'dist', 'media');
			if (!fs.existsSync(distMediaDir)) {
				fs.mkdirSync(distMediaDir, { recursive: true });
			}
			
			// Copy WASM files
			const wasmFiles = [
				'tree-sitter-javascript.wasm',
				'tree-sitter-typescript.wasm'
			];
			
			wasmFiles.forEach(file => {
				const src = path.join(__dirname, 'media', file);
				const dest = path.join(distMediaDir, file);
				if (fs.existsSync(src)) {
					fs.copyFileSync(src, dest);
					console.log(`Copied ${file} to dist/media/`);
				}
			});
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
			copyWasmPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
