// Minimal DOM shim for ExplorerDecor (it only needs head.createEl / remove).
const fakeStyle: any = { textContent: '', remove() {} };
(globalThis as any).document = {
    head: { createEl: (_t: string, _o: any) => fakeStyle },
    getElementById: () => null,
};

import { FolderNote } from '../src/folder-note';
import { ExplorerDecor } from '../src/explorer-decor';
// @ts-ignore - test stub
import { createApp } from 'obsidian';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
    if (cond) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

const app: any = (createApp as any)(
    ['A', 'A/B', 'A/B/B.md', 'A/B/other.md', 'Quote"Folder', 'Quote"Folder/Quote"Folder.md'], null);
const fn = new FolderNote(app, 'inside', '_about_');
const decor = new ExplorerDecor(app, fn);
decor.load();
const css = fakeStyle.textContent;

console.log('\nExplorerDecor CSS generation');
check('hides the folder note', css.includes('.nav-file-title[data-path="A/B/B.md"]'));
check('does not hide ordinary notes', !css.includes('other.md'), css);
check('tints the folder', css.includes('.nav-folder-title[data-path="A/B"] > .nav-folder-title-content'));
check('uses a live theme variable', css.includes('var(--text-accent)'));
check('escapes quotes in paths', css.includes('Quote\\"Folder'), css);
check('no stale variable', !css.includes('--text-nav-selected'));

decor.hideNotes = false; decor.markFolders = false; decor.rebuild();
check('both toggles off -> empty stylesheet', fakeStyle.textContent === '');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
