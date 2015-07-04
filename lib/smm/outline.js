import { MMOMDatabase, MMOMStatement } from './mmom';
const { COMMENT } = MMOMStatement;

const LEADS = new Map().set('####',1).set('#*#*',2).set('=-=-',3).set('....',4);

class MMOMOutline {
    constructor(db) {
        this._db = db;
        this._dirty = true;
        this._outline = [];
        this._db._observer.push(this);
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
            let prologue = lines.join('').trim();
            this._outline.push({ statement: stmt, level: level, title: title, prologue: prologue });
        }
    }
}

Object.defineProperty(MMOMDatabase.prototype, 'outlineEntries', { get: function () {
    return this.outline._update()._outline;
}});

MMOMDatabase.registerAnalyzer('outline', MMOMOutline);
