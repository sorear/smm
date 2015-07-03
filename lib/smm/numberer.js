import { MMOMDatabase, MMOMStatement } from './mmom';
const { AXIOM, PROVABLE, OPEN, CLOSE, CONSTANT, VARIABLE, FLOATING, ESSENTIAL, DV, MAX_TYPE } = MMOMStatement;

const ALL_FILTER  = new Int32Array(MAX_TYPE+1); [ AXIOM, PROVABLE, OPEN, CLOSE, CONSTANT, VARIABLE, FLOATING, ESSENTIAL, DV ].forEach( type => ALL_FILTER[type] = 1 );
const PINK_FILTER = new Int32Array(MAX_TYPE+1); [ AXIOM, PROVABLE ].forEach( type => PINK_FILTER[type] = 1 );

// This is an extremely simple example of an analyzer, as it has no error conditions
class MMOMNumberer {
    constructor(db) {
        this._db = db;
        this._dirty = true;
        this._counts = new Int32Array();
        this._pink = new Int32Array();
        this._all = new Int32Array();
        this._db._observer.push(this);
    }

    notifyChanged(rec) {
        this._dirty = true;
    }

    _scan() {
        this._dirty = false;
        let counts = this._counts = new Int32Array(MAX_TYPE + 1);

        for (let i = 0; i < this._db.statements.length; i++)
            counts[this._db.statements[i].type]++;

        let pinkCount = 0, allCount = 0;
        for (let i = 0; i <= MAX_TYPE; i++) {
            if (ALL_FILTER[i]) allCount += counts[i];
            if (PINK_FILTER[i]) pinkCount += counts[i];
        }

        let pink = this._pink = new Int32Array(pinkCount);
        let all = this._all = new Int32Array(allCount);

        let j = 0, k = 0;

        for (let i = 0; i < this._db.statements.length; i++) {
            let type = this._db.statements[i].type;
            if (ALL_FILTER[type]) all[k++] = i;
            if (PINK_FILTER[type]) pink[j++] = i;
        }
    }

    _update() {
        if (this._dirty) this._scan();
        return this;
    }

    get counts() { return this._update()._counts; }
}

MMOMDatabase.prototype.statementByPinkNumber = function (nr) {
    nr |= 0;
    let array = this.numberer._update()._pink;
    if (nr <= 0 || nr > array.length) throw new RangeError('pinkNumber out of range');
    return this.statement(array[nr - 1]);
};

MMOMDatabase.prototype.statementByMetamathNumber = function (nr) {
    nr |= 0;
    let array = this.numberer._update()._all;
    if (nr <= 0 || nr > array.length) throw new RangeError('metamathNumber out of range');
    return this.statement(array[nr - 1]);
};

Object.defineProperty(MMOMDatabase.prototype, 'assertionCount', { get: function () {
    return this.numberer._update()._pink.length;
}});

function search(ary, val) {
    let j = 0, k = ary.length, l;
    if (k === 0) return -1;
    while (k - j > 1) {
        l = (j + k) >>> 1;
        if (val >= ary[l]) {
            j = l;
        }
        else {
            k = l;
        }
    }
    return (ary[j] === val) ? j : -1;
}

Object.defineProperty(MMOMStatement.prototype, 'pinkNumber', { get: function () {
    let db = this.database;
    let array = db && db.numberer._update()._pink;
    let index = array ? search(array, this.index) : -1;
    if (index < 0) throw new TypeError('statement does not have a pinkNumber');
    return index + 1;
}});

Object.defineProperty(MMOMStatement.prototype, 'metamathNumber', { get: function () {
    let db = this.database;
    let array = db && db.numberer._update()._all;
    let index = array ? search(array, this.index) : -1;
    if (index < 0) throw new TypeError('statement does not have a metamathNumber');
    return index + 1;
}});

MMOMDatabase.registerAnalyzer('numberer', MMOMNumberer);
