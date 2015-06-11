if (typeof define !== 'function') { var define = require('amdefine')(module) }

define([], function () {
'use strict';

// This data model is fairly similar to that used by METAMATH.C, although we
// make statement-level comments their own kind of segment.

function MMSource(name, string) {
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

MMSource.prototype.lookupPos = function (pos) {
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

// TODO: Add a length field and turn the zones into a linked list to support raw-text extraction without a reparse.  Will probably be needed for efficient comment rendering and WRITE SOURCE
function MMSegment() {
    this.type = MMSegment.EOF;
    this._pos = null;
    this.label = null;
    this.math = null;
    this.proof = null;
    this.reparse_zone = null;
    this.reparse_index = 0;
}

Object.defineProperty(MMSegment.prototype, 'raw', {
    get: function () {
        var out = '', spans = this.spans;
        for (var i = 0; i < spans.length; i += 3) {
            out += spans[i].text.substr(spans[i+1],spans[i+2]);
        }
        return out;
    }
});
Object.defineProperty(MMSegment.prototype, 'mathPos', { get: function () { if (!this._pos) this._unlazy(); return this._pos.mathPos; } });
Object.defineProperty(MMSegment.prototype, 'proofPos', { get: function () { if (!this._pos) this._unlazy(); return this._pos.proofPos; } });
Object.defineProperty(MMSegment.prototype, 'startPos', { get: function () { if (!this._pos) this._unlazy(); return this._pos.startPos; } });
Object.defineProperty(MMSegment.prototype, 'spans', { get: function () { if (!this._pos) this._unlazy(); return this._pos.spans; } });

MMSegment.prototype._unlazy = function () {
    var scanner = new MMScanner(this.reparse_zone);
    scanner.lazyPositions = false;
    scanner.reparsing = true;
    scanner.index = scanner.segment_start = this.reparse_index;
    scanner.segment._pos = { startPos: null, mathPos: null, proofPos: null, spans: [] };

    var nseg = scanner.scan();
    if (!nseg) throw "can't happen - sources unavailable in reparse";
    this._pos = nseg._pos;
};

// TODO change this to a span list, provide span list extractors for tokens, segments, compressed integers
function MMError(source, offset, category, code, data) {
    this.source = source;
    this.offset = offset;
    this.category = category;
    this.code = code;
    this.data = data;
}

MMError.prototype.toString = function() {
    var pos = this.source.lookupPos(this.offset);
    return `${this.source.name}:${pos[0]}:${pos[1]}:  ${this.code}`; // TODO add human versions, test
};

MMSegment.EOF = 1;
MMSegment.COMMENT = 2;
MMSegment.OPEN = 3;
MMSegment.CLOSE = 4;
MMSegment.CONST = 5;
MMSegment.VAR = 6;
MMSegment.DV = 7;
MMSegment.AXIOM = 8;
MMSegment.PROVABLE = 9;
MMSegment.BOGUS = 10;
MMSegment.ESSEN = 11;
MMSegment.FLOAT = 12;
MMSegment.INCLUDE = 13;

var S_IDLE=1,S_LABEL=2,S_MATH=3,S_PROOF=4;

// A scan context is a stateless object which survives the scan so as to support later lazy rescans.
function MMScanContext(root, resolver, sync) {
    if (typeof resolver === 'string') {
        resolver = new Map([[ root, resolver ]]);
    }
    var resolve_data;
    if (typeof resolver === 'object') {
        resolve_data = resolver;
        resolver = function (src) {
            src.text = resolve_data.get(src.name);
            if (src.text === undefined) {
                src.text = '';
                src.failed = true;
            }
        };
    }
    this.sync = sync;
    this.resolver = resolver;
    this.sources = new Map();
}

MMScanContext.prototype.getSource = function (name) {
    var src = this.sources.get(name);
    if (!src) {
        src = new MMSource(name, null);
        this.resolver(src);
        if (this.sync && src.text === null) throw 'Resolver failed to synchronously return text in parseSync context';
        this.sources.set(name, src);
    }
    return src;
};

MMScanContext.prototype.initialZone = function (name) {
    return new MMZone(this, this.getSource(name), null, 0, [name]);
};

// A zone stores the set of included files and the include stack.  A source position can always be identified by a zone and an offset.
function MMZone(ctx, source, next, next_continue, included) {
    this.ctx = ctx;
    this.source = source;
    this.next = next;
    this.next_continue = next_continue;
    this.included = included;
}

var BAILOUT_ZONE = new MMZone(new MMScanContext(), new MMSource(null, null), null, 0, []);

function MMScanner(zone) {
    //Output
    this.segment_start = 0;
    this.segments = [];
    this.db = null;
    this.errors = [];
    this.typesetting_comment = null;

    //State machine
    //Define a quiescent state as where IDLE, !comment, !directive, at the top of the loop in scan()
    //Then include_file/token_start/lt_index/lt_zone are dead, segment can be considered fresh
    this.state = S_IDLE;
    this.comment_state = false;
    this.directive_state = false;
    this.include_file = null;
    this.segment = new MMSegment();
    this.token_start = 0;
    this.token_special = false;
    this.segment.reparse_zone = zone;
    this.segment.reparse_index = 0;

    //Input
    this.zone = zone;
    this.source = zone.source;
    this.index = 0;

    this.reparsing = false;
    this.lazyPositions = true;
    //if (!this.lazyPositions) this.segment._pos = { startPos: null, mathPos: [], proofPos: [], spans: [] };
}

var SP = []; while (SP.length < 33) SP.push(false); SP[32] = SP[9] = SP[13] = SP[12] = SP[10] = true;

MMScanner.prototype.getToken = function () {
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
            this.addError('failed-to-read');
        this.token_special = true;
        return '';
    }

    return str.substring(start, ix);
};

// You may only call this after comment_state and directive_state have both cleared.  also the current source must be loaded
MMScanner.prototype.setPosition = function (zone, index) {
    var segment_start = this.segment_start;
    if (this.segment._pos && this.index !== segment_start) {
        this.segment._pos.spans.push(this.source, segment_start, this.index);
    }

    this.zone = zone;
    this.source = zone.source;
    this.index = index;
    this.segment_start = index;
};

MMScanner.prototype.addError = function (code) {
    this.errors.push(new MMError(this.source, this.token_start, 'scanner', code));
};

// We need to be able to reconstruct a segment by restarting parsing with the specified zone and index and a clean segment.  This is trivial for the first segment but for others the loss of parser state is an issue
// We guarantee below that newSegment is only ever called with comment_state=false, directive_state=false (implying include_file is dead).
// Most of the time, we call newSegment immediately before restarting the main loop with state=S_IDLE, so restarting from the current zone/index is correct (token_start is dead as it will be immediately clobbered by getToken, lt_* are not used in S_IDLE)
// When a statement-starting keyword is seen with an active statement, we need to logically start a new statement *before* the just-read token so that the keyword will be correctly seen on reparse.
MMScanner.prototype.newSegment = function (lt_index) {
    if (this.segment._pos && lt_index !== this.segment_start) this.segment._pos.spans.push(this.source, this.segment_start, lt_index);
    this.segments.push(this.segment);
    this.segment_start = lt_index;
    this.segment = new MMSegment();
    this.segment.reparse_zone = this.zone;
    this.segment.reparse_index = lt_index;
    if (this.reparsing) {
        this.zone = BAILOUT_ZONE;
        this.source = this.zone.source;
    }
    if (!this.lazyPositions) this.segment._pos = { startPos: null, mathPos: null, proofPos: null, spans: [] };
    return this.segment;
};

var KW_DATA = {
    '$a': { type: MMSegment.AXIOM,    label: true,  atomic: false },
    '$p': { type: MMSegment.PROVABLE, label: true,  atomic: false },
    '$c': { type: MMSegment.CONST,    label: false, atomic: false },
    '$d': { type: MMSegment.DV,       label: false, atomic: false },
    '$e': { type: MMSegment.ESSEN,    label: true,  atomic: false },
    '$f': { type: MMSegment.FLOAT,    label: true,  atomic: false },
    '$v': { type: MMSegment.VAR,      label: false, atomic: false },
    '${': { type: MMSegment.OPEN,     label: false, atomic: true },
    '$}': { type: MMSegment.CLOSE,    label: false, atomic: true },
    '':   { type: MMSegment.EOF,      label: false, atomic: true },
};

MMScanner.prototype.scan = function () {
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
                return this.segments[0];
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
                        this.segment.type = MMSegment.COMMENT;
                        this.newSegment(this.index);
                    }

                    continue;

                case '$t':
                    this.typesetting_comment = this.segment; // since we can very efficiently find this here
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
                    this.setPosition( new MMZone( this.zone.ctx, this.zone.ctx.getSource(this.include_file), this.zone, this.index, this.zone.included.concat(this.include_file) ), 0 );

                if (state === S_IDLE) {
                    this.segment.type = MMSegment.INCLUDE;
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
                    this.segment.label = token;
                    if (posit) this.segment._pos.startPos = [this.source, this.token_start];
                    state = S_LABEL;
                    break;
                case S_LABEL:
                    this.addError('duplicate-label');
                    this.segment.label = token;
                    break;
                case S_MATH:
                    this.segment.math.push(token);
                    if (posit) this.segment._pos.mathPos.push(this.source, this.token_start);
                    break;
                case S_PROOF:
                    this.segment.proof.push(token);
                    if (posit) this.segment._pos.proofPos.push(this.source, this.token_start);
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
                    if (this.segment.type === MMSegment.PROVABLE && state === S_MATH) {
                        this.addError('missing-proof');
                    }
                    this.newSegment(this.index);
                }
                else {
                    this.addError('spurious-period'); // IDLE or LABEL
                    this.segment.type = MMSegment.BOGUS;
                    this.newSegment(this.index);
                }
                state = S_IDLE;
                break;

            case '$=':
                if (state !== S_MATH || !this.segment.proof) {
                    this.addError('spurious-proof');
                    this.segment.type = MMSegment.BOGUS;
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
                    if (state === S_IDLE && this.index !== this.segment_start) {
                        this.segment.type = MMSegment.EOF;
                        this.setPosition(this.zone.next, this.zone.next_continue);
                        this.newSegment(this.index);
                    }
                    else {
                        this.setPosition(this.zone.next, this.zone.next_continue);
                    }
                    break;
                }

                // less than ideal because the keyword gets boxed into the last segment.  should ideally back up the previous by a statement or two
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
                this.segment.type = kwdata.type

                if (kwdata.label) {
                    if (state !== S_LABEL) {
                        this.addError('missing-label');
                        this.segment.type = MMSegment.BOGUS;
                    }
                }
                else {
                    if (state === S_LABEL) this.addError('spurious-label');
                    this.segment.label = null;
                    if (posit) this.segment._pos.startPos = [this.source, this.token_start];
                }

                if (kwdata.atomic) {
                    if (token === '') {
                        this.db = new MMDatabase;
                        this.db.segments = this.segments;
                        this.db.scanErrors = this.errors;
                        if (this.index !== this.segment_start) this.newSegment(this.index);
                        if (this.reparsing)
                            return this.segments[0];
                        return this.db;
                    }
                    this.newSegment(this.index);
                    state = S_IDLE;
                }
                else {
                    state = S_MATH;
                    this.segment.math = [];
                    if (posit) this.segment._pos.mathPos = [];
                    if (token === '$p') { // allocate a proof segment even if the segment type was forced to BOGUS due to missing label
                        if (posit) this.segment._pos.proofPos = [];
                        this.segment.proof = [];
                    }
                }
                break;

            default:
                this.addError('pseudo-keyword');
                break;
        }
    }
};

function MMDatabase() {
    this.segments = null;
    this.scanErrors = null;
    this.plugins = {};
}

MMScanner.parseSync = function (name, resolver) {
    return new MMScanner(new MMScanContext(name, resolver, true).initialZone(name)).scan();
};

return {
    Source: MMSource,
    Error: MMError,
    Segment: MMSegment,
    Scanner: MMScanner,
    Database: MMDatabase,
};

});
