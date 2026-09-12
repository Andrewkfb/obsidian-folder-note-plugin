import { App, MarkdownPostProcessorContext } from 'obsidian';
import { FolderBrief } from './folder-brief';
import { FolderNote } from './folder-note';
import { CardBlock } from './card-item';
import * as Yaml from 'yaml';

// ------------------------------------------------------------
// ccard processor
// ------------------------------------------------------------

export class ccardProcessor {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    async run(
        source: string,
        el: HTMLElement,
        ctx: MarkdownPostProcessorContext,
        folderNote: FolderNote,
    ): Promise<void> {
        try {
            const yaml = Yaml.parse(source);
            if (!yaml) return;

            if (yaml.type === undefined) yaml.type = 'static';
            if (yaml.style === undefined) yaml.style = 'card';

            let docEl: HTMLElement | null = null;
            if (yaml.type === 'static') {
                docEl = this.docElemStatic(yaml);
            } else if (yaml.type === 'folder_brief_live') {
                docEl = await this.docElemFolderBriefLive(yaml, ctx, folderNote);
            }

            if (docEl) el.appendChild(docEl);
        } catch (error) {
            console.error('Code Block: ccard', error);
            el.createEl('pre', { text: `ccard: ${error}` });
        }
    }

    private docElemStatic(yaml: any): HTMLElement | null {
        if (!yaml.items || !(yaml.items instanceof Array)) return null;
        const cardBlock = new CardBlock();
        cardBlock.fromYamlCards(yaml);
        return cardBlock.getDocElement(this.app);
    }

    private async docElemFolderBriefLive(
        yaml: any,
        ctx: MarkdownPostProcessorContext,
        folderNote: FolderNote,
    ): Promise<HTMLElement | null> {
        // ctx.sourcePath is the note the block actually lives in. Using the
        // *active* file here rendered the wrong folder whenever the block was
        // drawn in a background pane, a hover preview or an embed.
        const notePath = ctx.sourcePath;
        if (!notePath) return null;

        let folderPath: string;
        if (yaml.folder) {
            if (!this.app.vault.getFolderByPath(yaml.folder)) return null;
            folderPath = yaml.folder;
        } else {
            folderPath = folderNote.briefFolderPathForNote(notePath);
        }

        const folderBrief = new FolderBrief(this.app);
        if (yaml.briefMax) folderBrief.briefMax = yaml.briefMax;
        if (yaml.noteOnly !== undefined) folderBrief.noteOnly = yaml.noteOnly;

        const briefCards = await folderBrief.makeBriefCards(folderPath, notePath);
        briefCards.fromYamlOptions(yaml);
        return briefCards.getDocElement(this.app);
    }
}
