import { MMOMDatabase, MMOMStatement } from './mmom';
const { COMMENT } = MMOMStatement;

const LEADS = new Map().set('####',1).set('#*#*',2).set('=-=-',3).set('....',4);
const MAX_LEVEL = 4;

// There are more complete solutions out there, but this focuses on simplicity of exposition
function slugify(str) {
                                           // "A Theorem by Stefan O'Rear Showing 2 + 2 = 4 &trade;"
    str = str.replace(/'/g, '');           // "A Theorem by Stefan ORear Showing 2 + 2 = 4 &trade;"
    str = str.replace(/&[^;]+;/g, '');     // "A Theorem by Stefan ORear Showing 2 + 2 = 4 "
    str = str.toLowerCase();               // "a theorem by stefan orear showing 2 + 2 = 4 "
    str = str.replace(/[^a-z0-9]+/g, '-'); // "a-theorem-by-stefan-orear-showing-2-2-4-"
    str = str.replace(/^-|-$/g, '');       // "a-theorem-by-stefan-orear-showing-2-2-4"
    return str || 'unnamed';
}

// 1. extract a list of outline nodes from the database, roughly following the metamath spec, with prologues and slugs
// 2. flesh it out into a tree by inserting _top nodes
// note that every node has its own slug on top of its path, which will never be _top, except for the virtual §0 used when there is no outline

class MMOMOutlineNode {
    constructor(stmt, level, title, slug, prologue) {
        this.statement = stmt;
        this.level = level;
        this.title = title;
        this.slug = slug;
        this.prologue = prologue;
        this.ordinal = 0;
        this.path = null;
        this.children = [];
    }

    get parent() {
        let n = this.path && this.path.length > 1 && this.path[this.path.length - 2];
        return n.statement ? n : null;
    }

    // true if this is an explicit outline node with only explicit parents
    get inFlow() {
        return !this.path.filter(x => x.ordinal === 0).length;
    }

    // hopefully valid whenever inFlow is true
    get siblings() {
        let p = this.parent;
        return p ? p.children : (this.path && this.path.length === 1) ? this.statement.database.outlineRoots : [];
    }
}

class MMOMOutline {
    constructor(db) {
        this._db = db;
        this._dirty = true;
        this._outline = [];
        this._minUsed = this._maxUsed = 1;
        this._outlineRoots = [];
        this._db._observer.push(this);
        this._top = null;
        this._slugMap = null;
    }

    notifyChanged(rec) {
        this._dirty = true;
    }

    _update() {
        if (this._dirty) this._scan();
        return this;
    }

    _scan() {
        this._dirty = false;
        this._outline.length = 0;
        this._outlineRoots.length = 0;
        this._minUsed = MAX_LEVEL;
        this._maxUsed = 1;
        this._top = new MMOMOutlineNode(null, 0, '<Unnamed section>', '_top', '');
        this._top.path = [this._top];
        this._slugMap = new Map();

        for (let i = 0; i < this._db.statements.length; i++) {
            let stmt = this._db.statements[i];
            if (stmt.type !== COMMENT) continue;
            let text = stmt.commentText;
            if (text.length < 5) continue;
            if (text.charCodeAt(0) >= 32) continue;
            text = text.replace(/\r\n?/g, '\n');
            let level = LEADS.get(text.slice(1,5));
            if (level === undefined) continue;

            // 2nd line is title, 3rd line is ignored (if present), remainder is prologue
            // format is not precisely specced anywhere :(

            let lines = text.split('\n');
            let title = (lines[2] || '').trim();
            if (!title) continue;
            lines.splice(0,4);
            let prologue = lines.join('\n').trim();
            let slug = slugify(title);

            if (this._slugMap.has(slug)) {
                let j = 2;
                while (this._slugMap.has(`${slug}-${j}`)) j++;
                slug = `${slug}-${j}`;
            }

            this._maxUsed = Math.max(this._maxUsed, level);
            this._minUsed = Math.min(this._minUsed, level);
            let node = new MMOMOutlineNode(stmt, level, title, slug, prologue);
            this._outline.push(node);
            this._slugMap.set(slug, node);
        }

        if (!this._outline.length) {
            this._minUsed = this._maxUsed = 1; // require level range to be non-empty
        }

        let scratch = [];
        while (scratch.length <= MAX_LEVEL) scratch.push(this._top);

        for (let i = 0; i < this._outline.length; i++) {
            let line = this._outline[i];
            line.ordinal = scratch[line.level].ordinal + 1;
            scratch[line.level] = line;

            if (line.level > 0 && scratch[line.level - 1] !== this._top) {
                scratch[line.level - 1].children.push(line);
            }
            else if (line.level === this._minUsed) {
                this._outlineRoots.push(line);
            }

            for (let j = line.level + 1; j <= MAX_LEVEL; j++) {
                scratch[j] = this._top;
            }
            line.path = scratch.slice(this._minUsed,line.level+1);
        }
    }
}

Object.defineProperty(MMOMDatabase.prototype, 'outlineNodes', { get: function () {
    return this.outline._update()._outline;
}});

Object.defineProperty(MMOMDatabase.prototype, 'outlineRoots', { get: function () {
    return this.outline._update()._outlineRoots;
}});

Object.defineProperty(MMOMDatabase.prototype, 'outlineLevelBase', { get: function () {
    return this.outline._update()._minUsed;
}});

Object.defineProperty(MMOMDatabase.prototype, 'outlineLevelsUsed', { get: function () {
    let o = this.outline._update();
    return o._maxUsed - o._minUsed + 1;
}});

Object.defineProperty(MMOMStatement.prototype, 'outlineNode', { get: function () {
    let outliner = this.database.outline._update();
    let last = outliner._top;
    // Could use binary search
    for (let i = 0; i < outliner._outline.length; i++) {
        let line = outliner._outline[i];
        if (line.statement.index > this.index) break;
        last = line;
    }
    return last;
}});

MMOMDatabase.prototype.outlineBySlug = function outlineBySlug(slug) {
    return this.outline._update()._slugMap.get(slug) || null;
};

MMOMDatabase.registerAnalyzer('outline', MMOMOutline);
