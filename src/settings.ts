import { App, PluginSettingTab, Setting } from 'obsidian';

import FolderNotePlugin from './main';

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

export interface FolderNotePluginSettings {
    folderNoteHide: boolean;
    folderNoteHighlight: boolean;
    folderNoteType: string;
    folderNoteName: string;
    folderNoteKey: string;
    folderNoteAutoRename: boolean;
    folderDelete2Note: boolean;
    folderNoteStrInit: string;
}

export const FOLDER_NOTE_DEFAULT_SETTINGS: FolderNotePluginSettings = {
    folderNoteHide: true,
    folderNoteHighlight: true,
    folderNoteType: 'inside',
    folderNoteName: '_about_',
    folderNoteKey: 'ctrl',
    folderNoteAutoRename: true,
    folderDelete2Note: false,
    folderNoteStrInit: '# {{FOLDER_NAME}} Overview\n {{FOLDER_BRIEF_LIVE}} \n',
};

// ------------------------------------------------------------
// Settings Tab
// ------------------------------------------------------------

export class FolderNoteSettingTab extends PluginSettingTab {
    plugin: FolderNotePlugin;

    constructor(app: App, plugin: FolderNotePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Note file method')
            .setDesc('Where the folder note lives. See the plugin docs for the trade-offs.')
            .addDropdown((dropDown) =>
                dropDown
                    .addOption('index', 'Index file')
                    .addOption('inside', 'Folder name inside')
                    .addOption('outside', 'Folder name outside')
                    .setValue(this.plugin.settings.folderNoteType || 'inside')
                    .onChange(async (value: string) => {
                        this.plugin.settings.folderNoteType = value;
                        await this.plugin.saveSettings();
                        this.display();
                    }));

        if (this.plugin.settings.folderNoteType === 'index') {
            new Setting(containerEl)
                .setName('Index file name')
                .setDesc('Base name used for every folder note. (Index method only.)')
                .addText((text) =>
                    text
                        .setValue(this.plugin.settings.folderNoteName)
                        .onChange(async (value) => {
                            this.plugin.settings.folderNoteName = value.trim() || '_about_';
                            await this.plugin.saveSettings();
                        }));
        }

        new Setting(containerEl)
            .setName('Initial content')
            .setDesc('Template for a new folder note. {{FOLDER_NAME}}, {{FOLDER_PATH}}, '
                + '{{FOLDER_BRIEF}} and {{FOLDER_BRIEF_LIVE}} are substituted.')
            .addTextArea((text) => {
                text
                    .setPlaceholder('About the folder.')
                    .setValue(this.plugin.settings.folderNoteStrInit)
                    .onChange(async (value) => {
                        this.plugin.settings.folderNoteStrInit = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 8;
                text.inputEl.cols = 50;
            });

        new Setting(containerEl)
            .setName('Key for new note')
            .setDesc('Hold this key and click a folder to create its note.')
            .addDropdown((dropDown) =>
                dropDown
                    .addOption('ctrl', 'Ctrl / Cmd + click')
                    .addOption('alt', 'Alt + click')
                    .setValue(this.plugin.settings.folderNoteKey || 'ctrl')
                    .onChange(async (value: string) => {
                        this.plugin.settings.folderNoteKey = value;
                        await this.plugin.saveSettings();
                    }));

        new Setting(containerEl)
            .setName('Hide folder note')
            .setDesc('Hide the folder note file in the file explorer.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.folderNoteHide);
                toggle.onChange(async (value) => {
                    this.plugin.settings.folderNoteHide = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Highlight folders with a note')
            .setDesc('Tint the name of any folder that has a folder note.')
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.folderNoteHighlight);
                toggle.onChange(async (value) => {
                    this.plugin.settings.folderNoteHighlight = value;
                    await this.plugin.saveSettings();
                });
            });

        if (this.plugin.settings.folderNoteType !== 'index') {
            new Setting(containerEl)
                .setName('Auto rename')
                .setDesc('Keep the folder and its note named the same. Renames go through '
                    + "Obsidian, so links pointing at the note are updated.")
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.folderNoteAutoRename);
                    toggle.onChange(async (value) => {
                        this.plugin.settings.folderNoteAutoRename = value;
                        await this.plugin.saveSettings();
                    });
                });
        }

        if (this.plugin.settings.folderNoteType === 'outside') {
            new Setting(containerEl)
                .setName('Delete folder note with folder')
                .setDesc('When a folder is deleted, move its note to trash as well. '
                    + 'Uses your "Deleted files" preference.')
                .addToggle((toggle) => {
                    toggle.setValue(this.plugin.settings.folderDelete2Note);
                    toggle.onChange(async (value) => {
                        this.plugin.settings.folderDelete2Note = value;
                        await this.plugin.saveSettings();
                    });
                });
        }
    }
}
