import { App, debounce } from 'obsidian';
import { FolderNote } from './folder-note';

// ------------------------------------------------------------
// Explorer decoration
//
// The file explorer in Obsidian 1.x is virtualised: rows are created and
// thrown away as you scroll or fold, so classes poked onto a row by hand
// disappear again. Instead we keep one <style> element holding rules keyed
// on the data-path attribute, which applies to every row the moment it is
// rendered -- including on vault load, and including folders never clicked.
// ------------------------------------------------------------

const STYLE_ID = 'folder-note-plugin-decorations';

function escapeAttr(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class ExplorerDecor {
    private app: App;
    folderNote: FolderNote;
    private styleEl: HTMLStyleElement | null = null;

    hideNotes = true;
    markFolders = true;

    /** Coalesces bursts of vault events into a single rebuild. */
    refresh = debounce(() => this.rebuild(), 150, true);

    constructor(app: App, folderNote: FolderNote) {
        this.app = app;
        this.folderNote = folderNote;
    }

    load(): void {
        this.unload();
        this.styleEl = document.head.createEl('style', { attr: { id: STYLE_ID } });
        this.rebuild();
    }

    unload(): void {
        this.styleEl?.remove();
        this.styleEl = null;
        document.getElementById(STYLE_ID)?.remove();
    }

    rebuild(): void {
        if (!this.styleEl) return;

        if (!this.hideNotes && !this.markFolders) {
            this.styleEl.textContent = '';
            return;
        }

        const pairs = this.folderNote.listFolderNotes();
        const rules: string[] = [];

        if (this.hideNotes && pairs.size > 0) {
            const selectors = Array.from(pairs.keys())
                .map((notePath) => `.nav-file-title[data-path="${escapeAttr(notePath)}"]`);
            rules.push(`${selectors.join(',\n')} { display: none !important; }`);
        }

        if (this.markFolders && pairs.size > 0) {
            const folders = Array.from(new Set(pairs.values()));
            const selectors = folders
                .map((p) => `.nav-folder-title[data-path="${escapeAttr(p)}"] > .nav-folder-title-content`);
            rules.push(`${selectors.join(',\n')} { color: var(--text-accent); }`);
        }

        this.styleEl.textContent = rules.join('\n\n');
    }
}
