if (typeof define !== 'function') { var define = require('amdefine')(module) }

define([], function () {
'use strict';

// This data model is fairly similar to that used by METAMATH.C, although we
// make statement-level comments their own kind of statement.

function MMOMSource(name, string) {
    this.name = name;
    this.text = string;
    this.failed = false;
    this.eolMaps = null;
}

// hot inner loop, avoid stuff that could deopt
function eolScan(string, array, sfirst, send, afirst) {
    //console.log('SCAN',string.length,send-sfirst,sfirst,afirst);
    var slen = string.length;
    while (sfirst < send) {
        var ch = string.charCodeAt(sfirst++);
        if (ch <= 13) {
            if (ch === 10) {
                array[afirst++] = sfirst;
            }
            else if (ch === 13) {
                if (sfirst !== send && string.charCodeAt(sfirst) === 10) {
                    sfirst++; // skip LF after CR; note, sfirst>send is possible now
                }
                array[afirst++] = sfirst;
            }
        }
    }

    return [sfirst, afirst];
}

// get indices of all linebreaks in the string
function getEolArray(string) {
    var out = [], sfirst = 0;

    out.push(new Int32Array([0]));

    var quantum = Math.max(100, Math.floor(string.length / 100));
    while (sfirst < string.length) {
        var alen = 2*quantum;
        var acur = new Int32Array(alen);
        var aix  = 0;

        while (sfirst < string.length && (alen - aix) >= quantum) {
            var tmp = eolScan(string, acur, sfirst, sfirst + Math.min(string.length - sfirst, alen - aix), aix);
            sfirst = tmp[0];
            aix = tmp[1];
        }

        if (aix) out.push(acur.subarray(0,aix));
    }

    return out;
}

MMOMSource.prototype.lookupPos = function (pos) {
    if (!this.eolMaps) this.eolMaps = getEolArray(this.text);
    var maps = this.eolMaps;

    var skip = 0;
    var low = 0, high = maps.length - 1;

    while (low !== high) {
        var mid = (low + high + 1) >> 1; // >low, <=high
        if (pos >= maps[mid][0]) {
            while (low < mid) {
                skip += maps[low++].length;
            }
        }
        else {
            high = mid-1;
        }
    }

    var the_map = maps[low];
    low = 0; high = the_map.length-1;

    while (low !== high) {
        var mid = (low + high + 1) >> 1;
        if (pos >= the_map[mid]) {
            low = mid;
        }
        else {
            high = mid-1;
        }
    }

    return [ low+skip+1, pos-the_map[low]+1 ]; // "column" will be slightly off in the presence of tabs (evil) and supplementary characters (I care, but not much)
};

MMOMSource.prototype.getLine = function (lnum) {
    if (!this.eolMaps) this.eolMaps = getEolArray(this.text);
    var maps = this.eolMaps;
    lnum--;
    if (lnum < 0) return "";
    var i = 0;
    // could use binary search, but this array has O(1) bounded size
    while (i < maps.length && lnum >= maps[i].length) {
        lnum -= maps[i].length;
        i++;
    }

    if (i === maps.length) return "";
    return this.text.substring(maps[i][lnum], (lnum + 1 === maps[i].length) ? (i+1 === maps.length ? this.text.length : maps[i+1][0]) : maps[i][lnum+1]);
};

var SP = []; while (SP.length < 33) SP.push(false); SP[32] = SP[9] = SP[13] = SP[12] = SP[10] = true;

// keep this in sync with MMOMScanner.getToken
MMOMSource.prototype.tokenEnd = function (pos) {
    var ch;
    while (pos < this.text.length && ((ch = this.text.charCodeAt(pos)) > 32 || !SP[ch])) pos++;
    return pos;
};

// TODO: Add a length field and turn the zones into a linked list to support raw-text extraction without a reparse.  Will probably be needed for efficient comment rendering and WRITE SOURCE
function MMOMStatement() {
    this.type = MMOMStatement.EOF;
    this._pos = null;
    this.label = null;
    this.math = null;
    this.proof = null;
    this.reparse_zone = null;
    this.reparse_index = 0;
    this.length = 0;
    this.index = 0;
}

MMOMStatement.EOF = 1;
MMOMStatement.COMMENT = 2;
MMOMStatement.OPEN = 3;
MMOMStatement.CLOSE = 4;
MMOMStatement.CONSTANT = 5;
MMOMStatement.VARIABLE = 6;
MMOMStatement.DISJOINT = 7;
MMOMStatement.AXIOM = 8;
MMOMStatement.PROVABLE = 9;
MMOMStatement.BOGUS = 10;
MMOMStatement.ESSENTIAL = 11;
MMOMStatement.FLOATING = 12;
MMOMStatement.INCLUDE = 13;

Object.defineProperty(MMOMStatement.prototype, 'raw', {
    get: function () {
        var out = '', spans = this.spans;
        for (var i = 0; i < spans.length; i += 3) {
            out += spans[i].text.substr(spans[i+1],spans[i+2]);
        }
        return out;
    }
});
Object.defineProperty(MMOMStatement.prototype, 'mathPos', { get: function () { if (!this._pos) this._unlazy(); return this._pos.mathPos; } });
Object.defineProperty(MMOMStatement.prototype, 'proofPos', { get: function () { if (!this._pos) this._unlazy(); return this._pos.proofPos; } });
Object.defineProperty(MMOMStatement.prototype, 'startPos', { get: function () { if (!this._pos) this._unlazy(); return this._pos.startPos; } });
Object.defineProperty(MMOMStatement.prototype, 'spans', { get: function () { if (!this._pos) this._unlazy(); return this._pos.spans; } });

Object.defineProperty(MMOMStatement.prototype, 'database', { get: function () {
    return this.index >= 0 ? this.reparse_zone.database : null;
} });

MMOMStatement.prototype._unlazy = function () {
    var scanner = new MMOMScanner(this.reparse_zone);
    scanner.lazyPositions = false;
    scanner.reparsing = true;
    scanner.index = scanner.statement_start = this.reparse_index;
    scanner.statement._pos = { startPos: null, mathPos: null, proofPos: null, spans: [] };

    var nst = scanner.scan();
    if (!nst) throw "can't happen - sources unavailable in reparse";
    this._pos = nst._pos;
};

function MMOMErrorLocation(kind, statement, source, from, to, data) {
    this.kind = kind;
    this.statement = statement;
    this.source = source;
    this.from = from;
    this.to = to;
    this.data = data;
}

MMOMErrorLocation.scanToken = function (statement, source, pos) {
    return new MMOMErrorLocation('scan-token', statement, source, pos, source.tokenEnd(pos), null);
};

MMOMErrorLocation._functional = function (statement, kind, ary, ix) {
    return new MMOMErrorLocation(kind, statement, ary[ix], ary[ix+1], ary[ix].tokenEnd(ary[ix+1]), null);
};

MMOMErrorLocation.statement = function (statement) { return MMOMErrorLocation._functional(statement, 'statement', statement.startPos, 0); }
MMOMErrorLocation.label = function (statement) { return MMOMErrorLocation._functional(statement, 'label', statement.startPos, 0); }
MMOMErrorLocation.math = function (statement, ix) { return MMOMErrorLocation._functional(statement, 'math', statement.mathPos, 2*ix); }
MMOMErrorLocation.proof = function (statement, ix) { return MMOMErrorLocation._functional(statement, 'proof', statement.proofPos, 2*ix); }

MMOMErrorLocation.prototype.error = function (category, code, data) {
    return new MMOMError(this, category, code, data);
};

// statement, span, category are required
function MMOMError(location, category, code, data) {
    this.location = location;
    this.category = category;
    this.code = code;
    this.data = data || {};
    if (!this.definition) throw new Error("No definition for generated error");
}

MMOMError.prototype.toString = function() {
    var source = this.location.source;
    var pos = source.lookupPos(this.location.from);
    return `${source.name}:${pos[0]}:${pos[1]}:  ${this.code}`; // TODO add human versions, test
};

MMOMError._registry = new Map();

Object.defineProperty(MMOMError.prototype, 'definition', { get: function () {
    var l1 = MMOMError._registry.get(this.category);
    return l1 && l1.get(this.code);
} });

// subst codes :l location :m math :s statement-label :t text/toString
MMOMError.register = function (category, code, template, options) {
    var l1 = MMOMError._registry.get(category);
    if (!l1) MMOMError._registry.set(category, l1 = new Map);
    l1.set(code, { template: template, options: options });
};

MMOMError.register('scanner', 'bad-character', 'Characters in database may only be printable ASCII characters or the following controls: newline, carriage return, form feed, tab');
MMOMError.register('scanner', 'failed-to-read', 'Failed to read, reason: «reason:t»');
MMOMError.register('scanner', 'eof-in-comment', 'Comments must be closed in the file in which they start');
MMOMError.register('scanner', 'pseudo-comment-end', '$) not legal in comment (add spaces if this is intended to end it)');
MMOMError.register('scanner', 'pseudo-nested-comment', '$( not legal in comment');
MMOMError.register('scanner', 'missing-filename', 'Filename missing in inclusion directive');
MMOMError.register('scanner', 'unterminated-directive', 'Directives must be closed in the file in which they start');
MMOMError.register('scanner', 'directive-too-long', 'Included file name must be a single token (spaces not allowed)');
MMOMError.register('scanner', 'dollar-in-filename', '$ not allowed in included file name');
MMOMError.register('scanner', 'invalid-label', 'Only alphanumerics, dashes, underscores, and periods are allowed in statement labels');
MMOMError.register('scanner', 'duplicate-label', 'Label found but there is already a pending label');
MMOMError.register('scanner', 'loose-comment-end', '$) found but there is no active comment');
MMOMError.register('scanner', 'missing-proof', '$p statement must have a $= section with a proof');
MMOMError.register('scanner', 'spurious-period', '$. found where not expected (no current statement)');
MMOMError.register('scanner', 'spurious-proof', '$= proof sections are only allowed on $p statements');
MMOMError.register('scanner', 'loose-directive-end', '$] found but there is no active file inclusion');
MMOMError.register('scanner', 'nonterminated-math', 'Math string must be closed with $. or $= ... $. before beginning a new statement');
MMOMError.register('scanner', 'nonterminated-proof', 'Proof string must be closed with $. before beginning a new statement');
MMOMError.register('scanner', 'missing-label', 'This statement type requires a label');
MMOMError.register('scanner', 'spurious-label', 'This statement type does not admit a label');
MMOMError.register('scanner', 'pseudo-keyword', 'This token contains $ but is not a recognized keyword');

var S_IDLE=1,S_LABEL=2,S_MATH=3,S_PROOF=4;

// A scan context is a stateless object which survives the scan so as to support later lazy rescans.
function MMOMScanContext(root, resolver, sync) {
    this.sync = sync;
    this.resolver = resolver;
    this.sources = new Map();
}

MMOMScanContext.prototype.getSource = function (name) {
    var src = this.sources.get(name);
    if (!src) {
        src = new MMOMSource(name, null);
        this.resolver(src);
        if (this.sync && src.text === null) throw 'Resolver failed to synchronously return text in parseSync context';
        this.sources.set(name, src);
    }
    return src;
};

MMOMScanContext.prototype.initialZone = function (name) {
    return new MMOMZone(new MMOMDatabase(), this, this.getSource(name), null, 0, [name]);
};

// A zone stores the set of included files and the include stack.  A source position can always be identified by a zone and an offset.
function MMOMZone(db, ctx, source, next, next_continue, included) {
    this.database = db;
    this.ctx = ctx;
    this.source = source;
    this.next = next;
    this.next_continue = next_continue;
    this.included = included;
}

var BAILOUT_ZONE = new MMOMZone(null, new MMOMScanContext(), new MMOMSource(null, null), null, 0, []);

function MMOMScanner(zone) {
    //Output
    this.statement_start = 0;
    this.statements = [];
    this.db = zone.database;
    this.errors = [];
    this.typesetting_comment = null;

    //State machine
    //Define a quiescent state as where IDLE, !comment, !directive, at the top of the loop in scan()
    //Then include_file/token_start/lt_index/lt_zone are dead, statement can be considered fresh
    this.state = S_IDLE;
    this.comment_state = false;
    this.directive_state = false;
    this.include_file = null;
    this.statement = new MMOMStatement();
    this.token_start = 0;
    this.token_special = false;
    this.statement.reparse_zone = zone;
    this.statement.reparse_index = 0;

    //Input
    this.zone = zone;
    this.source = zone.source;
    this.index = 0;

    this.reparsing = false;
    this.lazyPositions = true;
    //if (!this.lazyPositions) this.statement._pos = { startPos: null, mathPos: [], proofPos: [], spans: [] };
}

MMOMScanner.prototype.addError = function (code, data) {
    this.errors.push(MMOMErrorLocation.scanToken(this.statement, this.source, this.token_start).error('scanner', code, data));
};

MMOMScanner.prototype.getToken = function () {
    var ix = this.index, str = this.source.text;
    // source not yet loaded
    if (str === null) {
        return null;
    }
    var len = str.length, start, chr;

    while (ix < len && (chr = str.charCodeAt(ix)) <= 32 && SP[chr]) ix++;
    this.token_start = start = ix;
    this.token_special = false;
    while (ix < len && ((chr = str.charCodeAt(ix)) > 32 || !SP[chr])) {
        if (chr < 32 || chr > 126) {
            this.addError('bad-character');
            // skip this token entirely...
            ix++;
            while (ix < len && !SP[str.charCodeAt(ix)]) ix++;
            while (ix < len && SP[str.charCodeAt(ix)]) ix++;
            this.token_start = start = ix;
            this.token_special = false;
            continue;
        }
        else if (chr === 0x24) {
            this.token_special = true;
        }
        ix++;
    }

    this.index = ix;

    if (start === ix) {
        // getToken should return '' exactly once before the zone is switched out, hence falls through below
        if (this.source.failed)
            this.addError('failed-to-read', { reason: this.source.failed });
        this.token_special = true;
        return '';
    }

    return str.substring(start, ix);
};

// You may only call this after comment_state and directive_state have both cleared.  also the current source must be loaded
MMOMScanner.prototype.setPosition = function (zone, index) {
    var statement_start = this.statement_start;
    if (this.index !== statement_start) {
        if (this.statement._pos) this.statement._pos.spans.push(this.source, statement_start, this.index);
        this.statement.length += (this.index - statement_start);
    }

    this.zone = zone;
    this.source = zone.source;
    this.index = index;
    this.statement_start = index;
};

// We need to be able to reconstruct a statement by restarting parsing with the specified zone and index and a clean statement.  This is trivial for the first statement but for others the loss of parser state is an issue
// We guarantee below that newSegment is only ever called with comment_state=false, directive_state=false (implying include_file is dead).
// Most of the time, we call newSegment immediately before restarting the main loop with state=S_IDLE, so restarting from the current zone/index is correct (token_start is dead as it will be immediately clobbered by getToken, lt_* are not used in S_IDLE)
// When a statement-starting keyword is seen with an active statement, we need to logically start a new statement *before* the just-read token so that the keyword will be correctly seen on reparse.
MMOMScanner.prototype.newSegment = function (lt_index) {
    if (lt_index !== this.statement_start) {
        if (this.statement._pos) this.statement._pos.spans.push(this.source, this.statement_start, lt_index);
        this.statement.length += (lt_index - this.statement_start);
    }
    this.statement.index = this.statements.length;
    this.statements.push(this.statement);
    this.statement_start = lt_index;
    this.statement = new MMOMStatement();
    this.statement.reparse_zone = this.zone;
    this.statement.reparse_index = lt_index;
    if (this.reparsing) {
        this.zone = BAILOUT_ZONE;
        this.source = this.zone.source;
    }
    if (!this.lazyPositions) this.statement._pos = { startPos: null, mathPos: null, proofPos: null, spans: [] };
    return this.statement;
};

var KW_DATA = {
    '$a': { type: MMOMStatement.AXIOM,     label: true,  atomic: false },
    '$p': { type: MMOMStatement.PROVABLE,  label: true,  atomic: false },
    '$c': { type: MMOMStatement.CONSTANT,  label: false, atomic: false },
    '$d': { type: MMOMStatement.DISJOINT,  label: false, atomic: false },
    '$e': { type: MMOMStatement.ESSENTIAL, label: true,  atomic: false },
    '$f': { type: MMOMStatement.FLOATING,  label: true,  atomic: false },
    '$v': { type: MMOMStatement.VARIABLE,  label: false, atomic: false },
    '${': { type: MMOMStatement.OPEN,      label: false, atomic: true },
    '$}': { type: MMOMStatement.CLOSE,     label: false, atomic: true },
    '':   { type: MMOMStatement.EOF,       label: false, atomic: true },
};

MMOMScanner.prototype.scan = function () {
    var comment_state = this.comment_state;
    var directive_state = this.directive_state;
    var state = this.state;
    var token, lt_index, kwdata;
    var posit = !this.lazyPositions;

    // note: this version of the loop tokenizes everything, even comments and proofs, which is somewhat wasteful
    while (true) {
        lt_index = this.index;
        token = this.getToken();

        if (token === null) {
            if (this.zone === BAILOUT_ZONE && this.reparsing) {
                return this.statements[0];
            }
            this.comment_state = comment_state;
            this.state = state;
            this.directive_state = directive_state;
            return false;
        }

        if (comment_state) {
            if (!this.token_special) continue;
            switch (token) {
                case '$)':
                    comment_state = false;

                    if (state === S_IDLE) {
                        this.statement.type = MMOMStatement.COMMENT;
                        this.newSegment(this.index);
                    }

                    continue;

                case '$t':
                    this.typesetting_comment = this.statement; // since we can very efficiently find this here
                    continue;

                case '':
                    this.addError('eof-in-comment');
                    comment_state = false;
                    break; // fall through so that we'll also handle an enclosing comment and end the file

                default:
                    if (token.indexOf('$)') >= 0)
                        this.addError('pseudo-comment-end');
                    if (token.indexOf('$(') >= 0)
                        this.addError('pseudo-nested-comment');
                    continue;
            }
        }

        if (directive_state) {
            if (token === '$]') {
                directive_state = false;
                if (this.include_file === null) {
                    this.addError('missing-filename');
                    continue;
                }

                // TODO: this requires resolution to deal with path canonicity issues
                if (this.zone.included.indexOf(this.include_file) < 0)
                    this.setPosition( new MMOMZone( this.zone.database, this.zone.ctx, this.zone.ctx.getSource(this.include_file), this.zone, this.index, this.zone.included.concat(this.include_file) ), 0 );

                if (state === S_IDLE) {
                    this.statement.type = MMOMStatement.INCLUDE;
                    this.newSegment(this.index);
                }

                continue;
            }

            if (token === '') {
                this.addError('unterminated-directive');
                directive_state = false;
                // fall through to handle end of the current file
            }
            else {
                if (this.include_file !== null) {
                    this.addError('directive-too-long');
                    continue;
                }

                if (this.token_special) {
                    this.addError('dollar-in-filename');
                    continue;
                }

                this.include_file = token;
                continue;
            }
        }

        if (!this.token_special) {
            switch (state) {
                case S_IDLE:
                    if (/[^-_.0-9a-zA-Z]/.test(token))
                        this.addError('invalid-label'); // currently still allow into DOM
                    this.statement.label = token;
                    if (posit) this.statement._pos.startPos = [this.source, this.token_start];
                    state = S_LABEL;
                    break;
                case S_LABEL:
                    this.addError('duplicate-label');
                    this.statement.label = token;
                    break;
                case S_MATH:
                    this.statement.math.push(token);
                    if (posit) this.statement._pos.mathPos.push(this.source, this.token_start);
                    break;
                case S_PROOF:
                    this.statement.proof.push(token);
                    if (posit) this.statement._pos.proofPos.push(this.source, this.token_start);
                    break;
            }
            continue;
        }

        switch (token) {
            case '$(':
                comment_state = true;
                break;

            case '$[':
                directive_state = true;
                this.include_file = null;
                break;

            case '$)':
                this.addError('loose-comment-end');
                break;

            case '$.':
                if (state === S_MATH || state === S_PROOF) {
                    if (this.statement.type === MMOMStatement.PROVABLE && state === S_MATH) {
                        this.addError('missing-proof');
                    }
                    this.newSegment(this.index);
                }
                else {
                    this.addError('spurious-period'); // IDLE or LABEL
                    this.statement.type = MMOMStatement.BOGUS;
                    this.newSegment(this.index);
                }
                state = S_IDLE;
                break;

            case '$=':
                if (state !== S_MATH || !this.statement.proof) {
                    this.addError('spurious-proof');
                    this.statement.type = MMOMStatement.BOGUS;
                }
                else {
                    state = S_PROOF;
                }
                break;

            case '$]':
                this.addError('loose-directive-end');
                break;

            case '$a':
            case '$c':
            case '$d':
            case '$e':
            case '$f':
            case '$p':
            case '$v':
            case '${':
            case '$}':
            case '':
                if (token === '' && this.zone.next) {
                    // file switch: need not interrupt a statement

                    // idle state cannot span a file boundary with spans (due to EOF having already been created), so it's unneccessary to check that
                    if (state === S_IDLE && this.index !== this.statement_start) {
                        this.statement.type = MMOMStatement.EOF;
                        this.setPosition(this.zone.next, this.zone.next_continue);
                        this.newSegment(this.index);
                    }
                    else {
                        this.setPosition(this.zone.next, this.zone.next_continue);
                    }
                    break;
                }

                // less than ideal because the keyword gets boxed into the last statement.  should ideally back up the previous by a statement or two
                if (state === S_MATH) {
                    this.addError('nonterminated-math');
                    this.newSegment(lt_index);
                    state = S_IDLE;
                }
                else if (state === S_PROOF) {
                    this.addError('nonterminated-proof');
                    this.newSegment(lt_index);
                    state = S_IDLE;
                }

                kwdata = KW_DATA[token];
                this.statement.type = kwdata.type

                if (kwdata.label) {
                    if (state !== S_LABEL) {
                        this.addError('missing-label');
                        this.statement.type = MMOMStatement.BOGUS;
                    }
                }
                else {
                    if (state === S_LABEL) this.addError('spurious-label');
                    this.statement.label = null;
                    if (posit) this.statement._pos.startPos = [this.source, this.token_start];
                }

                if (kwdata.atomic) {
                    if (token === '') {
                        if (!this.reparsing) {
                            this.db.statements = this.statements;
                            this.db.scanErrors = this.errors;
                        }
                        if (this.index !== this.statement_start) this.newSegment(this.index);
                        if (this.reparsing)
                            return this.statements[0];
                        return this.db;
                    }
                    this.newSegment(this.index);
                    state = S_IDLE;
                }
                else {
                    state = S_MATH;
                    this.statement.math = [];
                    if (posit) this.statement._pos.mathPos = [];
                    if (token === '$p') { // allocate a proof statement even if the statement type was forced to BOGUS due to missing label
                        if (posit) this.statement._pos.proofPos = [];
                        this.statement.proof = [];
                    }
                }
                break;

            default:
                this.addError('pseudo-keyword');
                break;
        }
    }
};

var KnownAnalyzerKeys = [];

function MMOMDatabase() {
    this.statements = null;
    this.scanErrors = null;
    for (var i = 0; i < KnownAnalyzerKeys.length; i++) {
        this[KnownAnalyzerKeys[i]] = null;
    }
}

MMOMDatabase.registerAnalyzer = function (name, constructor) {
    var key = '__' + name;

    KnownAnalyzerKeys.push(key);

    Object.defineProperty(MMOMDatabase.prototype, name, { get: function () {
        return this[key] || (this[key] = new constructor(this));
    } });
};

Object.defineProperty(MMOMDatabase.prototype, 'statementCount', { get: function () { return this.statements.length; } });
MMOMDatabase.prototype.statement = function (ix) { return this.statements[ix]; };

function parseSync(name, resolver) {
    if (typeof resolver === 'string') {
        resolver = new Map([[ name, resolver ]]);
    }

    function resolve(source) {
        if (resolver instanceof Map) {
            source.text = resolver.get(source.name);
            if (source.text === undefined) {
                source.text = '';
                source.failed = 'Not in passed hash';
            }
        }
        else {
            try {
                source.text = resolver(source.name);
                if (typeof source.text !== 'string') throw new Error('resolver returned non-string');
            }
            catch (e) {
                source.failed = e || 'false';
                source.text = '';
            }
        }
    }

    return new MMOMScanner(new MMOMScanContext(name, resolve, true).initialZone(name)).scan();
};

function parseAsync(name, resolver) {
    return new Promise(function (resolve, reject) {
        function retry() {
            if (!scanner) return;
            var db = scanner.scan();
            if (!db) return;
            scanner = null;
            resolve(db);
        }

        function handler(source) {
            new Promise(function (resolve2) { resolve2(resolver(source.name)); }).then(
                function (text) { source.text = text; retry(); },
                function (err)  { source.text = ''; source.failed = err || 'false'; retry(); }
            );
        }

        var scanner = new MMOMScanner(new MMOMScanContext(name, handler, false).initialZone(name));
        retry();
    });
}

return {
    Source: MMOMSource,
    Error: MMOMError,
    ErrorLocation: MMOMErrorLocation,
    Statement: MMOMStatement,
    Scanner: MMOMScanner,
    Database: MMOMDatabase,
    ScanContext: MMOMScanContext,
    parseSync: parseSync,
    parseAsync: parseAsync,
};

});
