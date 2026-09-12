import { App, Notice, TAbstractFile, TFile, TFolder } from 'obsidian';
import { FolderBrief } from './folder-brief';

// ------------------------------------------------------------
// Folder Note
//
// Path resolution is pure and synchronous; everything that touches
// the vault goes through the Vault / FileManager APIs so that
// Obsidian keeps its metadata cache and wikilinks in sync.
// ------------------------------------------------------------

export enum NoteFileMethod {
    Index, Inside, Outside,
}

export function methodFromString(value: string): NoteFileMethod {
    if (value === 'index') return NoteFileMethod.Index;
    if (value === 'outside') return NoteFileMethod.Outside;
    return NoteFileMethod.Inside;
}

function baseName(path: string): string {
    return path.split('/').pop() ?? '';
}

function parentPath(path: string): string {
    const slash = path.lastIndexOf('/');
    return slash < 0 ? '' : path.substring(0, slash);
}

export class FolderNote {
    app: App;
    method: NoteFileMethod;
    indexBase: string;
    initContent: string;

    /** Guards against reacting to the renames we perform ourselves. */
    private syncing = false;

    constructor(app: App, methodStr: string, indexBase: string) {
        this.app = app;
        this.method = methodFromString(methodStr);
        this.indexBase = indexBase || '_about_';
        this.initContent = '';
    }

    // --------------------------------------------------------
    // Pure path resolution
    // --------------------------------------------------------

    /** Where the note for `folderPath` should live. Null for the vault root. */
    notePathForFolder(folderPath: string): string | null {
        if (!folderPath || folderPath === '/') return null;
        if (this.method === NoteFileMethod.Index) {
            return `${folderPath}/${this.indexBase}.md`;
        }
        if (this.method === NoteFileMethod.Inside) {
            return `${folderPath}/${baseName(folderPath)}.md`;
        }
        return `${folderPath}.md`;
    }

    /**
     * The folder `notePath` would describe, or null if the path cannot be a
     * folder note under the current method. The folder is NOT checked for
     * existence -- callers that need that should look it up in the vault.
     */
    folderPathForNote(notePath: string): string | null {
        if (!notePath.endsWith('.md')) return null;

        if (this.method === NoteFileMethod.Index) {
            const suffix = `/${this.indexBase}.md`;
            if (!notePath.endsWith(suffix)) return null;
            return notePath.substring(0, notePath.length - suffix.length);
        }

        if (this.method === NoteFileMethod.Inside) {
            const folder = parentPath(notePath);
            if (!folder) return null;
            const noteBase = baseName(notePath).slice(0, -3);
            return baseName(folder) === noteBase ? folder : null;
        }

        // Outside
        return notePath.slice(0, -3);
    }

    // --------------------------------------------------------
    // Vault lookups (all O(1) in-memory, no disk access)
    // --------------------------------------------------------

    getFolderNote(folder: TFolder): TFile | null {
        const notePath = this.notePathForFolder(folder.path);
        return notePath ? this.app.vault.getFileByPath(notePath) : null;
    }

    isFolderNote(file: TFile): boolean {
        const folderPath = this.folderPathForNote(file.path);
        return !!folderPath && !!this.app.vault.getFolderByPath(folderPath);
    }

    /** Map of every existing folder note -> the folder it describes. */
    listFolderNotes(): Map<string, string> {
        const found = new Map<string, string>();
        for (const file of this.app.vault.getMarkdownFiles()) {
            const folderPath = this.folderPathForNote(file.path);
            if (!folderPath) continue;
            if (!this.app.vault.getFolderByPath(folderPath)) continue;
            found.set(file.path, folderPath);
        }
        return found;
    }

    /** Folder whose brief a given note should describe. */
    briefFolderPathForNote(notePath: string): string {
        const file = this.app.vault.getFileByPath(notePath);
        if (file && this.isFolderNote(file)) {
            return this.folderPathForNote(notePath) as string;
        }
        return parentPath(notePath);
    }

    // --------------------------------------------------------
    // Creation
    // --------------------------------------------------------

    async createFolderNote(folder: TFolder): Promise<TFile | null> {
        const notePath = this.notePathForFolder(folder.path);
        if (!notePath) return null;

        const existing = this.app.vault.getFileByPath(notePath);
        if (existing) return existing;

        try {
            const content = await this.expandContent(this.initContent, folder);
            return await this.app.vault.create(notePath, content);
        } catch (err) {
            // Another process may have won the race; fall back to the file on disk.
            const raced = this.app.vault.getFileByPath(notePath);
            if (raced) return raced;
            console.error('Folder Note: could not create folder note', err);
            new Notice('Folder Note: could not create the folder note (see console).');
            return null;
        }
    }

    /** Turn the current note into a folder (the "Make Current Note to Folder" command). */
    async makeNoteIntoFolder(note: TFile): Promise<void> {
        if (this.method === NoteFileMethod.Index) {
            new Notice('Folder Note: this command is not available with the "Index File" method.');
            return;
        }

        const folderPath = note.path.slice(0, -3);
        if (this.app.vault.getAbstractFileByPath(folderPath)) {
            new Notice(`Folder Note: "${folderPath}" already exists.`);
            return;
        }

        try {
            await this.app.vault.createFolder(folderPath);
        } catch (err) {
            console.error('Folder Note: could not create folder', err);
            new Notice('Folder Note: could not create the folder (see console).');
            return;
        }

        if (this.method === NoteFileMethod.Inside) {
            // The note has to move inside the folder it just spawned.
            await this.renameSafely(note, `${folderPath}/${note.basename}.md`);
        }
    }

    // --------------------------------------------------------
    // Template expansion
    // --------------------------------------------------------

    async expandContent(template: string, folder: TFolder): Promise<string> {
        let content = template
            .replace(/{{FOLDER_NAME}}/g, folder.name)
            .replace(/{{FOLDER_PATH}}/g, folder.path);

        if (content.includes('{{FOLDER_BRIEF}}')) {
            const notePath = this.notePathForFolder(folder.path) ?? '';
            const brief = new FolderBrief(this.app);
            const cards = await brief.makeBriefCards(folder.path, notePath);
            content = content.replace(/{{FOLDER_BRIEF}}/g, cards.getYamlCode());
        }

        if (content.includes('{{FOLDER_BRIEF_LIVE}}')) {
            content = content.replace(
                /{{FOLDER_BRIEF_LIVE}}/g,
                '\n```ccard\ntype: folder_brief_live\n```\n');
        }

        return content;
    }

    // --------------------------------------------------------
    // Keeping folder and note names in step
    // --------------------------------------------------------

    async syncRename(file: TAbstractFile, oldPath: string): Promise<void> {
        // An index note keeps its name no matter what the folder is called.
        if (this.method === NoteFileMethod.Index) return;
        if (this.syncing) return;

        if (file instanceof TFolder) {
            await this.syncFolderRenamed(file, oldPath);
        } else if (file instanceof TFile && file.extension === 'md') {
            await this.syncNoteRenamed(file, oldPath);
        }
    }

    /** The folder moved or was renamed -- bring its note along. */
    private async syncFolderRenamed(folder: TFolder, oldPath: string): Promise<void> {
        if (this.method === NoteFileMethod.Outside) {
            const note = this.app.vault.getFileByPath(`${oldPath}.md`);
            if (!note) return;
            const target = `${folder.path}.md`;
            if (target !== note.path) await this.renameSafely(note, target);
            return;
        }

        // Inside: the note travelled with the folder but still carries the old name.
        const carried = this.app.vault.getFileByPath(`${folder.path}/${baseName(oldPath)}.md`);
        if (!carried) return;
        const target = `${folder.path}/${folder.name}.md`;
        if (target !== carried.path) await this.renameSafely(carried, target);
    }

    /** A folder note was renamed -- bring its folder along. */
    private async syncNoteRenamed(note: TFile, oldPath: string): Promise<void> {
        const oldFolderPath = this.folderPathForNote(oldPath);
        if (!oldFolderPath) return;

        const folder = this.app.vault.getFolderByPath(oldFolderPath);
        if (!folder) return;

        let target: string;
        if (this.method === NoteFileMethod.Outside) {
            target = note.path.slice(0, -3);
        } else {
            // Inside: only follow a rename in place. If the note was dragged out
            // of its folder it has stopped being that folder's note, and moving
            // the folder after it would be a surprise.
            if (note.parent?.path !== folder.path) return;
            const grandparent = parentPath(folder.path);
            target = grandparent ? `${grandparent}/${note.basename}` : note.basename;
        }

        if (target !== folder.path) await this.renameSafely(folder, target);
    }

    /** Delete the note that belongs to a folder that was just deleted. */
    async syncDelete(file: TAbstractFile): Promise<void> {
        if (this.method !== NoteFileMethod.Outside) return;
        if (!(file instanceof TFolder)) return;

        const note = this.app.vault.getFileByPath(`${file.path}.md`);
        if (!note) return;

        try {
            // Honours the user's "Deleted files" preference (system trash / .trash / permanent).
            await this.app.fileManager.trashFile(note);
        } catch (err) {
            console.error('Folder Note: could not trash folder note', err);
        }
    }

    private async renameSafely(target: TAbstractFile, newPath: string): Promise<void> {
        if (this.app.vault.getAbstractFileByPath(newPath)) {
            new Notice(`Folder Note: "${newPath}" already exists, rename skipped.`);
            return;
        }

        this.syncing = true;
        try {
            // renameFile (not adapter.rename) is what updates wikilinks pointing here.
            await this.app.fileManager.renameFile(target, newPath);
        } catch (err) {
            console.error('Folder Note: rename failed', err);
            new Notice('Folder Note: rename failed (see console).');
        } finally {
            this.syncing = false;
        }
    }
}
