// Minimal in-memory stand-in for the Obsidian API, enough to drive FolderNote.
class TAbstractFile {
  constructor(path) { this.setPath(path); }
  setPath(p) {
    this.path = p;
    this.name = p.split('/').pop();
  }
  get parent() { return this.vault._parentOf(this.path); }
}
class TFile extends TAbstractFile {
  setPath(p) {
    super.setPath(p);
    const dot = this.name.lastIndexOf('.');
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot > 0 ? this.name.slice(dot + 1) : '';
  }
  get stat() { return { mtime: 0, ctime: 0, size: 0 }; }
}
class TFolder extends TAbstractFile {
  get children() { return this.vault._childrenOf(this.path); }
  isRoot() { return this.path === '/'; }
}
class Notice { constructor(msg) { Notice.log.push(msg); } }
Notice.log = [];
const debounce = (fn) => fn;

class Vault {
  constructor(paths) {
    this.entries = new Map();
    this.root = new TFolder('/'); this.root.vault = this;
    for (const p of paths) this._add(p);
  }
  _add(p) {
    const isFolder = !p.includes('.');
    const node = isFolder ? new TFolder(p) : new TFile(p);
    node.vault = this;
    this.entries.set(p, node);
  }
  _parentOf(p) {
    const i = p.lastIndexOf('/');
    if (i < 0) return this.root;
    return this.entries.get(p.slice(0, i)) ?? this.root;
  }
  _childrenOf(p) {
    const out = [];
    for (const [k, v] of this.entries) {
      const parent = k.lastIndexOf('/') < 0 ? '' : k.slice(0, k.lastIndexOf('/'));
      if (parent === (p === '/' ? '' : p)) out.push(v);
    }
    return out;
  }
  getRoot() { return this.root; }
  getAbstractFileByPath(p) { return this.entries.get(p) ?? null; }
  getFileByPath(p) { const e = this.entries.get(p); return e instanceof TFile ? e : null; }
  getFolderByPath(p) { const e = this.entries.get(p); return e instanceof TFolder ? e : null; }
  getMarkdownFiles() { return [...this.entries.values()].filter(e => e instanceof TFile && e.extension === 'md'); }
  async create(p, content) { this._add(p); this.entries.get(p).content = content; return this.entries.get(p); }
  async createFolder(p) { this._add(p); return this.entries.get(p); }
  async cachedRead(f) { return f.content ?? ''; }
  snapshot() { return [...this.entries.keys()].sort(); }
}

class FileManager {
  constructor(vault, onRename) { this.vault = vault; this.onRename = onRename; }
  async renameFile(file, newPath) {
    const v = this.vault, old = file.path;
    const moves = [[old, newPath]];
    if (file instanceof TFolder) {
      for (const k of v.entries.keys()) {
        if (k.startsWith(old + '/')) moves.push([k, newPath + k.slice(old.length)]);
      }
    }
    for (const [from, to] of moves) {
      const node = v.entries.get(from);
      v.entries.delete(from);
      node.setPath(to);
      v.entries.set(to, node);
    }
    // Obsidian emits a rename event for the renamed item.
    if (this.onRename) await this.onRename(v.entries.get(newPath), old);
  }
  async trashFile(file) { this.vault.entries.delete(file.path); }
}

function createApp(paths, onRename) {
  const vault = new Vault(paths);
  const app = { vault };
  app.fileManager = new FileManager(vault, (f, o) => onRename && onRename(app, f, o));
  return app;
}

module.exports = { TAbstractFile, TFile, TFolder, Notice, debounce, createApp };
