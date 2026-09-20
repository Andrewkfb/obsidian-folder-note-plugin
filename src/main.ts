import { Editor, MarkdownView, Menu, Notice, Plugin, TAbstractFile, TFile, TFolder } from 'obsidian';

import { FolderBrief } from './folder-brief';
import { FolderNote } from './folder-note';
import { ExplorerDecor } from './explorer-decor';
import { ccardProcessor } from './ccard-block';

import {
    FolderNotePluginSettings,
    FOLDER_NOTE_DEFAULT_SETTINGS,
    FolderNoteSettingTab,
} from './settings';

// ------------------------------------------------------------
// FolderNotePlugin
// ------------------------------------------------------------

export default class FolderNotePlugin extends Plugin {
    settings: FolderNotePluginSettings;
    folderNote: FolderNote;
    decor: ExplorerDecor;

    async onload() {
        await this.loadSettings();

        this.registerMarkdownCodeBlockProcessor('ccard', async (source, el, ctx) => {
            const proc = new ccardProcessor(this.app);
            await proc.run(source, el, ctx, this.folderNote);
        });

        this.registerEvent(this.app.vault.on('rename', (file, oldPath) =>
            this.handleRename(file, oldPath)));
        this.registerEvent(this.app.vault.on('delete', (file) =>
            this.handleDelete(file)));
        this.registerEvent(this.app.vault.on('create', () => this.decor.refresh()));

        this.addSettingTab(new FolderNoteSettingTab(this.app, this));

        this.registerDomEvent(document, 'click', (evt: MouseEvent) => this.handleClick(evt));

        // The file explorer's folder menu: right-click on desktop, long-press on
        // mobile. The modifier-key gesture in handleClick() has no touch
        // equivalent, so this is the only route to creating a folder note on a
        // phone. Registered on both platforms so the two behave alike.
        this.registerEvent(this.app.workspace.on('file-menu', (menu, file) =>
            this.addFolderMenuItem(menu, file)));

        this.addCommand({
            id: 'insert-folder-brief',
            name: 'Insert folder brief',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                const activeFile = view.file;
                if (!activeFile) return;
                const folderPath = this.folderNote.briefFolderPathForNote(activeFile.path);
                const folderBrief = new FolderBrief(this.app);
                const briefCards = await folderBrief.makeBriefCards(folderPath, activeFile.path);
                editor.replaceSelection(briefCards.getYamlCode());
            },
        });

        this.addCommand({
            id: 'note-to-folder',
            name: 'Make current note into a folder',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== 'md') return false;
                if (!checking) void this.folderNote.makeNoteIntoFolder(file);
                return true;
            },
        });

        this.addCommand({
            id: 'open-folder-note',
            name: 'Open or create folder note for the current folder',
            checkCallback: (checking: boolean) => {
                const folder = this.app.workspace.getActiveFile()?.parent;
                if (!folder) return false;
                if (!checking) void this.openFolderNote(folder, true);
                return true;
            },
        });

        // The explorer decoration needs the vault index, which is only complete
        // once the layout is ready.
        this.app.workspace.onLayoutReady(() => this.decor.load());
    }

    onunload() {
        this.decor?.unload();
    }

    // --------------------------------------------------------
    // File explorer clicks
    // --------------------------------------------------------

    private handleClick(evt: MouseEvent) {
        const target = evt.target as Element | null;
        if (!target || typeof target.closest !== 'function') return;

        // Clicking the fold arrow should only fold.
        if (target.closest('.collapse-icon')) return;

        const titleEl = target.closest('.nav-folder-title');
        if (!titleEl) return;

        const folderPath = titleEl.getAttribute('data-path');
        if (!folderPath) return;

        const folder = this.app.vault.getFolderByPath(folderPath);
        if (!folder) return;

        let createIfMissing = false;
        if (this.settings.folderNoteKey === 'ctrl') {
            createIfMissing = evt.ctrlKey || evt.metaKey;
        } else if (this.settings.folderNoteKey === 'alt') {
            createIfMissing = evt.altKey;
        }

        void this.openFolderNote(folder, createIfMissing);
    }

    async openFolderNote(folder: TFolder, createIfMissing: boolean) {
        let note = this.folderNote.getFolderNote(folder);

        if (!note && createIfMissing) {
            note = await this.folderNote.createFolderNote(folder);
            this.decor.refresh();
        }
        if (!note) return;

        await this.app.workspace.getLeaf(false).openFile(note);
    }

    // --------------------------------------------------------
    // Folder context menu
    // --------------------------------------------------------

    /**
     * Adds an open-or-create item to a folder's context menu.
     *
     * Creation is offered unconditionally: unlike the click gesture, choosing
     * this item is already a deliberate act, so there is no modifier to stand
     * in for intent.
     */
    private addFolderMenuItem(menu: Menu, file: TAbstractFile) {
        if (!(file instanceof TFolder)) return;

        const existing = this.folderNote.getFolderNote(file);
        menu.addItem((item) => {
            item.setTitle(existing ? 'Open folder note' : 'Create folder note')
                .setIcon('file-text')
                .onClick(() => void this.openFolderNote(file, true));
        });
    }

    // --------------------------------------------------------
    // Vault events
    // --------------------------------------------------------

    private async handleRename(file: TAbstractFile, oldPath: string) {
        if (this.settings.folderNoteAutoRename) {
            await this.folderNote.syncRename(file, oldPath);
        }
        this.decor.refresh();
    }

    private async handleDelete(file: TAbstractFile) {
        if (this.settings.folderDelete2Note) {
            await this.folderNote.syncDelete(file);
        }
        this.decor.refresh();
    }

    // --------------------------------------------------------
    // Settings
    // --------------------------------------------------------

    async loadSettings() {
        // Object.assign into a fresh object -- assigning into the defaults
        // constant would let saved values leak into "restore defaults".
        this.settings = Object.assign({}, FOLDER_NOTE_DEFAULT_SETTINGS, await this.loadData());
        this.applySettings();
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.applySettings();
        this.decor?.refresh();
    }

    applySettings() {
        this.folderNote = new FolderNote(
            this.app,
            this.settings.folderNoteType,
            this.settings.folderNoteName);
        this.folderNote.initContent = this.settings.folderNoteStrInit;

        if (!this.decor) {
            this.decor = new ExplorerDecor(this.app, this.folderNote);
        } else {
            this.decor.folderNote = this.folderNote;
        }
        this.decor.hideNotes = this.settings.folderNoteHide;
        this.decor.markFolders = this.settings.folderNoteHighlight;
    }
}
