import { FolderNote } from '../src/folder-note';
// @ts-ignore - test stub
import { createApp, Notice } from 'obsidian';

let pass = 0, fail = 0;
function check(name: string, actual: string[], expected: string[]) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { pass++; console.log(`  ok   ${name}`); }
    else { fail++; console.log(`  FAIL ${name}\n        want ${e}\n        got  ${a}`); }
}

/** Build a vault whose rename events are fed back into FolderNote, like the plugin does. */
function scenario(method: string, paths: string[]) {
    let fn: FolderNote;
    const app: any = (createApp as any)(paths, (app: any, file: any, oldPath: string) => fn.syncRename(file, oldPath));
    fn = new FolderNote(app, method, '_about_');
    return { app, fn };
}

async function userRenames(s: any, from: string, to: string) {
    const file = s.app.vault.getAbstractFileByPath(from);
    await s.app.fileManager.renameFile(file, to);
}

(async () => {
console.log('\nINSIDE method (Folder/Folder.md)');
{
    let s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'A/B/child.md']);
    await userRenames(s, 'A/B', 'A/C');
    check('rename folder -> note follows', s.app.vault.snapshot(), ['A', 'A/C', 'A/C/C.md', 'A/C/child.md']);

    s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'A/B/child.md']);
    await userRenames(s, 'A/B/B.md', 'A/B/C.md');
    check('rename note -> folder follows', s.app.vault.snapshot(), ['A', 'A/C', 'A/C/C.md', 'A/C/child.md']);

    s = scenario('inside', ['B', 'B/B.md']);
    await userRenames(s, 'B/B.md', 'B/C.md');
    check('rename note at vault root', s.app.vault.snapshot(), ['C', 'C/C.md']);

    s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'A/B/plain.md']);
    await userRenames(s, 'A/B/plain.md', 'A/B/other.md');
    check('non-folder-note rename is ignored', s.app.vault.snapshot(), ['A', 'A/B', 'A/B/B.md', 'A/B/other.md']);

    s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'Elsewhere']);
    await userRenames(s, 'A/B/B.md', 'Elsewhere/B.md');
    check('note dragged out -> folder untouched', s.app.vault.snapshot(), ['A', 'A/B', 'Elsewhere', 'Elsewhere/B.md']);

    s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'X']);
    await userRenames(s, 'A/B', 'X/B');
    check('folder moved, name kept -> no churn', s.app.vault.snapshot(), ['A', 'X', 'X/B', 'X/B/B.md']);
}

console.log('\nOUTSIDE method (Folder.md beside Folder/)');
{
    let s = scenario('outside', ['A', 'A/B', 'A/B.md', 'A/B/child.md']);
    await userRenames(s, 'A/B', 'A/C');
    check('rename folder -> note follows', s.app.vault.snapshot(), ['A', 'A/C', 'A/C.md', 'A/C/child.md']);

    s = scenario('outside', ['A', 'A/B', 'A/B.md', 'A/B/child.md']);
    await userRenames(s, 'A/B.md', 'A/C.md');
    check('rename note -> folder follows', s.app.vault.snapshot(), ['A', 'A/C', 'A/C.md', 'A/C/child.md']);

    s = scenario('outside', ['A', 'A/B', 'A/B.md', 'X']);
    await userRenames(s, 'A/B.md', 'X/B.md');
    check('note moved -> folder moves with it', s.app.vault.snapshot(), ['A', 'X', 'X/B', 'X/B.md']);

    s = scenario('outside', ['A', 'A/loose.md']);
    await userRenames(s, 'A/loose.md', 'A/other.md');
    check('note with no folder is ignored', s.app.vault.snapshot(), ['A', 'A/other.md']);
}

console.log('\nINDEX method (Folder/_about_.md)');
{
    const s = scenario('index', ['A', 'A/B', 'A/B/_about_.md']);
    await userRenames(s, 'A/B', 'A/C');
    check('rename folder -> index name unchanged', s.app.vault.snapshot(), ['A', 'A/C', 'A/C/_about_.md']);
}

console.log('\nCollision safety');
{
    const s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'A/C']);
    Notice.log.length = 0;
    await userRenames(s, 'A/B/B.md', 'A/B/C.md');
    check('folder rename onto existing path is refused',
        s.app.vault.snapshot(), ['A', 'A/B', 'A/B/C.md', 'A/C']);
    check('...and warns the user', [Notice.log.length > 0 ? 'warned' : 'silent'], ['warned']);
}

console.log('\nDetection (listFolderNotes)');
{
    const s = scenario('inside', ['A', 'A/B', 'A/B/B.md', 'A/B/other.md', 'A/A.md']);
    const found = [...s.fn.listFolderNotes().entries()].map(([n, f]) => `${n} -> ${f}`).sort();
    check('finds exactly the folder notes', found, ['A/A.md -> A', 'A/B/B.md -> A/B']);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
})();
