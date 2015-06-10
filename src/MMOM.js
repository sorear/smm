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

function MMSegment() {
    this.type = MMSegment.EOF;
    this.spans = [];
    this.label = null;
    this.math = null;
    this.proof = null;
    this.mathPos = null;
    this.startPos = null;
    this.proofPos = null;
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
    this.lt_zone = null;
    this.lt_index = 0;

    //Input
    this.zone = zone;
    this.source = zone.source;
    this.index = 0;
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
    while (ix < len && ((chr = str.charCodeAt(ix)) > 32 || !SP[chr])) {
        if (chr < 32 || chr > 126) {
            this.addError('bad-character');
            // skip this token entirely...
            ix++;
            while (ix < len && !SP[str.charCodeAt(ix)]) ix++;
            while (ix < len && SP[str.charCodeAt(ix)]) ix++;
            this.token_start = start = ix;
            continue;
        }
        ix++;
    }

    this.index = ix;

    if (start === ix) {
        // getToken should return '' exactly once before the zone is switched out, hence falls through below
        if (this.source.failed)
            this.addError('failed-to-read');
        return '';
    }

    return str.substring(start, ix);
};

// You may only call this after comment_state and directive_state have both cleared.  also the current source must be loaded
MMScanner.prototype.setPosition = function (zone, index) {
    var segment_start = this.segment_start;
    if (this.index !== segment_start) {
        this.segment.spans.push(this.source, segment_start, this.index);
    }

    this.zone = zone;
    this.source = zone.source;
    this.index = index;
    this.segment_start = index;
};

MMScanner.prototype.addError = function (code) {
    this.errors.push(new MMError(this.source, this.token_start, 'scanner', code));
};

MMScanner.prototype.hasSpans = function () {
    return this.segment_start !== this.index || this.segment.spans.length !== 0;
};

MMScanner.prototype.newSegment = function () {
    this.segment.spans.push(this.source, this.segment_start, this.index);
    this.segments.push(this.segment);

    this.segment_start = this.index;
    return this.segment = new MMSegment();
};

var KW_TYPE = {
    '$a': MMSegment.AXIOM,
    '$p': MMSegment.PROVABLE,
    '$c': MMSegment.CONST,
    '$d': MMSegment.DV,
    '$e': MMSegment.ESSEN,
    '$f': MMSegment.FLOAT,
    '$v': MMSegment.VAR,
    '${': MMSegment.OPEN,
    '$}': MMSegment.CLOSE,
    '': MMSegment.EOF,
};

var KW_LABEL = {
    '$a': true,
    '$p': true,
    '$e': true,
    '$f': true,
};

var KW_ATOMIC = {
    '${': true,
    '$}': true,
    '': true,
};

MMScanner.prototype.scan = function () {
    var comment_state = this.comment_state;
    var directive_state = this.directive_state;
    var state = this.state;
    var token;

    // note: this version of the loop tokenizes everything, even comments and proofs, which is somewhat wasteful
    while (true) {
        token = this.getToken();

        if (token === null) {
            this.comment_state = comment_state;
            this.state = state;
            this.directive_state = directive_state;
            return false;
        }

        if (comment_state) {
            switch (token) {
                case '$)':
                    comment_state = false;

                    if (state === S_IDLE) {
                        this.segment.type = MMSegment.COMMENT;
                        this.newSegment();
                    }

                    continue;

                case '':
                    this.addError('eof-in-comment');
                    comment_state = false;
                    break; // fall through so that we'll also handle an enclosing comment and end the file

                default:
                    if (token.indexOf('$') >= 0) {
                        if (token.indexOf('$)') >= 0)
                            this.addError('pseudo-comment-end');
                        if (token.indexOf('$(') >= 0)
                            this.addError('pseudo-nested-comment');
                        if (token === '$t') {
                            this.typesetting_comment = this.segment; // since we can very efficiently find this here
                        }
                    }
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
                    this.newSegment();
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

                if (token.indexOf('$') >= 0) {
                    this.addError('dollar-in-filename');
                    continue;
                }

                this.include_file = token;
                continue;
            }
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
                    this.newSegment();
                }
                else {
                    this.addError('spurious-period'); // IDLE or LABEL
                    this.segment.type = MMSegment.BOGUS;
                    this.newSegment();
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

                    if (state === S_IDLE && this.hasSpans()) {
                        this.segment.type = MMSegment.EOF;
                        this.newSegment();
                    }

                    this.setPosition(this.zone.next, this.zone.next_continue);
                    break;
                }

                // less than ideal because the keyword gets boxed into the last segment.  should ideally back up the previous by a statement or two
                if (state === S_MATH) {
                    this.addError('nonterminated-math');
                    this.newSegment();
                    state = S_IDLE;
                }
                else if (state === S_PROOF) {
                    this.addError('nonterminated-proof');
                    this.newSegment();
                    state = S_IDLE;
                }

                this.segment.type = KW_TYPE[token];

                if (KW_LABEL[token]) {
                    if (state !== S_LABEL) {
                        this.addError('missing-label');
                        this.segment.type = MMSegment.BOGUS;
                    }
                }
                else {
                    if (state === S_LABEL) this.addError('spurious-label');
                    this.segment.label = null;
                    this.segment.startPos = [this.source, this.token_start];
                }

                if (KW_ATOMIC[token]) {
                    if (token === '') {
                        this.db = new MMDatabase;
                        this.db.segments = this.segments;
                        this.db.scanErrors = this.errors;
                        if (this.hasSpans()) this.newSegment();
                        return this.db;
                    }
                    this.newSegment();
                    state = S_IDLE;
                }
                else {
                    state = S_MATH;
                    this.segment.math = [];
                    this.segment.mathPos = [];
                    if (token === '$p') { // allocate a proof segment even if the segment type was forced to BOGUS due to missing label
                        this.segment.proofPos = [];
                        this.segment.proof = [];
                    }
                }
                break;

            default:
                if (token.indexOf('$') >= 0) {
                    this.addError('pseudo-keyword');
                    break;
                }

                if (state === S_IDLE) {
                    if (/[^-_.0-9a-zA-Z]/.test(token))
                        this.addError('invalid-label'); // currently still allow into DOM
                    this.segment.label = token;
                    this.segment.startPos = [this.source, this.token_start];
                    state = S_LABEL;
                }
                else if (state === S_LABEL) {
                    this.addError('duplicate-label');
                    this.segment.label = token;
                }
                else if (state === S_MATH) {
                    this.segment.math.push(token);
                    this.segment.mathPos.push(this.source, this.token_start);
                }
                else if (state === S_PROOF) {
                    this.segment.proof.push(token);
                    this.segment.proofPos.push(this.source, this.token_start);
                }
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
