import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const banner = `/*
Folder Note for Obsidian — modernised fork.
Source: https://github.com/xpgo/obsidian-folder-note-plugin
*/
`;

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtins],
	format: 'cjs',
	target: 'es2018',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
