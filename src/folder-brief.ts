import { App, TFile, TFolder } from 'obsidian';
import { CardStyle, CardBlock, CardItem } from './card-item';

// ------------------------------------------------------------
// Folder Brief
//
// Walks the in-memory vault tree rather than hitting the filesystem
// adapter, so a brief costs no disk I/O and respects the vault index.
// ------------------------------------------------------------

export class FolderBrief {
    app: App;
    briefMax: number;
    noteOnly: boolean;

    constructor(app: App) {
        this.app = app;
        this.briefMax = 64;
        this.noteOnly = false;
    }

    async makeBriefCards(folderPath: string, activeNotePath: string): Promise<CardBlock> {
        const cardBlock = new CardBlock();

        const folder = folderPath
            ? this.app.vault.getFolderByPath(folderPath)
            : this.app.vault.getRoot();
        if (!folder) return cardBlock;

        const children = [...folder.children].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        // Sub folders. A folder that has an "outside" note of its own is
        // represented by that note instead, so skip it here.
        if (!this.noteOnly) {
            for (const child of children) {
                if (!(child instanceof TFolder)) continue;
                if (this.app.vault.getFileByPath(`${child.path}.md`)) continue;
                cardBlock.addCard(this.makeFolderCard(folder.path, child));
            }
        }

        // Notes.
        for (const child of children) {
            if (!(child instanceof TFile) || child.extension !== 'md') continue;
            if (child.path === activeNotePath) continue; // don't include ourselves
            cardBlock.addCard(await this.makeNoteCard(folder.path, child));
        }

        return cardBlock;
    }

    makeFolderCard(folderPath: string, subFolder: TFolder): CardItem {
        const card = new CardItem(subFolder.name, CardStyle.Folder);

        let folders = 0;
        let notes = 0;
        for (const child of subFolder.children) {
            if (child instanceof TFolder) folders++;
            else notes++;
        }
        card.setAbstract(`Contains ${folders} folders, ${notes} notes.`);
        card.setFootnote(this.relativeTo(folderPath, subFolder.path));

        return card;
    }

    async makeNoteCard(folderPath: string, file: TFile): Promise<CardItem> {
        const card = new CardItem(file.basename, CardStyle.Note);
        card.setTitleLink(file.path);

        const contentOrg = await this.app.vault.cachedRead(file);

        const imageUrl = this.getContentImage(contentOrg, folderPath);
        if (imageUrl.length > 0) {
            card.setHeadImage(imageUrl);
        }

        let contentBrief = this.getContentBrief(contentOrg);
        if (contentBrief.length > 0) {
            if (contentBrief.length > this.briefMax) {
                contentBrief = contentBrief.substring(0, this.briefMax) + '...';
            }
            card.setAbstract(contentBrief);
        }

        if (file.stat) {
            card.setFootnote(new Date(file.stat.mtime).toLocaleString());
        } else {
            card.setFootnote(this.relativeTo(folderPath, file.path));
        }

        return card;
    }

    private relativeTo(folderPath: string, childPath: string): string {
        const prefix = `${folderPath}/`;
        return childPath.startsWith(prefix) ? childPath.slice(prefix.length) : childPath;
    }

    getContentImage(contentOrg: string, folderPath: string) {
        var imageUrl = '';
        // for patten: ![xxx.png]
        let regexImg = new RegExp('!\\[(.*?)\\]\\((.*?)\\)');
        var match = regexImg.exec(contentOrg);
        if (match != null) {
            imageUrl = match[2];
        }
        else {
            // for patten: ![[xxx.png]]
            let regexImg2 = new RegExp('!\\[\\[(.*?)\\]\\]');
            match = regexImg2.exec(contentOrg);
            if (match != null) imageUrl = match[1];
        }
        // add image url
        if (imageUrl.length > 0) {
            if (!imageUrl.startsWith('http')) {
                let headPath = folderPath;
                let relativePath = false;
                while (imageUrl.startsWith('../')) {
                    imageUrl = imageUrl.substring(3);
                    headPath = headPath.substring(0, headPath.lastIndexOf('/'));
                    relativePath = true;
                }
                if (relativePath) {
                    imageUrl = headPath + '/' + imageUrl;
                }
                imageUrl = imageUrl.replace(/\%20/g, ' ')
                // imageUrl = this.app.vault.adapter.getResourcePath(imageUrl);
            }
        }
        return imageUrl;
    }

    getContentBrief(contentOrg: string) {
        // remove some special content
        var content = contentOrg.trim();

        // skip yaml head
        if (content.startsWith('---\r') || content.startsWith('---\n') ) {
            const hPos2 = content.indexOf('---', 4);
            if (hPos2 >= 0 && (content[hPos2-1] == '\n' || (content[hPos2-1] == '\r'))) {
                content = content.substring(hPos2+4).trim();
            }
        }

        content = content
        // Remove YAML code
        // .replace(/^---[\r\n][^(---)]*[\r\n]---[\r\n]/g, '')
        // Remove HTML tags
        .replace(/<[^>]*>/g, '')
        // wiki style links
        .replace(/\!\[\[(.*?)\]\]/g, '')
        .replace(/\[\[(.*?)\]\]/g, '$1')
        // Remove images
        .replace(/\!\[(.*?)\][\[\(].*?[\]\)]/g, '')
        // Remove inline links
        .replace(/\[(.*?)\][\[\(].*?[\]\)]/g, '$1')
        // Remove emphasis (repeat the line to remove double emphasis)
        .replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, '$2')
        // Remove blockquotes
        .replace(/\n(&gt;|\>)(.*)/g, '')
        // Remove code blocks
        .replace(/(```[^\s]*\n[\s\S]*?\n```)/g, '')
        // Remove inline code
        .replace(/`(.+?)`/g, '$1')
        .trim()

        // try to get the first paragraph
        var contentBrief = '';
        content = '\n' + content + '\n';
        let regexP1 = new RegExp('\n([^\n|^#|^>])([^\n]+)\n', 'g'); 
        var match = null;
        if ((match = regexP1.exec(content)) !== null) {
            contentBrief = match[1] + match[2];
        }

        // console.log('contentBrief', contentBrief);
        contentBrief = contentBrief.trim();

        // use section headings
        if (contentBrief.length == 0) {
            let regexHead = new RegExp('^#{1,6}(?!#)(.*)[\r\n]', 'mg');
            while ((match = regexHead.exec(content)) !== null) {
                contentBrief += match[1] + ', ';
                if (contentBrief.length > this.briefMax) {
                    break;
                }
            }
            if (contentBrief.endsWith(', ')) {
                contentBrief = contentBrief.substring(0, contentBrief.length-2);
            }
        }

        // return
        return contentBrief;
    }
}
