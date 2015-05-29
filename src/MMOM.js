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
    this.errors = null;
}

function MMError(source, offset, category, code) {
    this.source = source;
    this.offset = offset;
    this.category = category;
    this.code = code;
}

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

function MMScanner(root, resolver) {
    //Output
    this.segment_start = 0;
    this.segments = [];

    //State machine
    this.state = S_IDLE;
    this.comment_state = false;
    this.directive_state = false;
    this.include_file = null;
    this.segment = new MMSegment();

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

    //Input
    this.queue = [];
    this.included = {};
    this.resolver = resolver;
    resolver(this.source = this.included[root] = new MMSource(root, null));
    this.index = 0;
    this.length = -1;
    this.token_start = 0;
}

MMScanner.prototype.getToken = function () {
    var ix = this.index, str = this.source.text, len = this.length, start, chr;

    // source not yet loaded
    if (str === null) {
        return null;
    }
    if (len < 0) {
        len = str.length;
    }

    while (ix < len && " \t\r\f\n".indexOf(str[ix]) >= 0) ix++;
    this.token_start = start = ix;
    while (ix < len && " \t\r\f\n".indexOf(chr = str[ix]) < 0) {
        if (chr < ' ' || chr > '~') this.addError('bad-character');
        ix++;
    }

    this.index = ix;

    if (start === ix) {
        if (this.length < 0) {
            // abuse length to record EOF-hit
            this.length = ix;
            if (this.source.failed)
                this.addError('failed-to-read');
        }
        return '';
    }

    return str.substring(start, ix);
};

MMScanner.prototype.includeFile = function (file) {
    if (this.included[file])
        return;

    var src = this.included[file] = new MMSource(file, null);
    this.resolver(src);

    // return to the current source
    this.queue.push({ source: this.source, index: this.index, length: this.length });
    // do the other thing first
    this.queue.push({ source: new MMSource(null), index: 0, length: -1 });
    // switch ASAP
    this.length = this.index;
};

// call this after getToken has returned '' at least once
MMScanner.prototype.nextSource = function () {
    var end = this.length < 0 ? this.source.text.length : this.length;
    var index = this.index;
    if (end > index) {
        this.segment.spans.push(this.source, index, end);
    }

    var rec = this.queue.pop();
    this.source = rec.source;
    this.index = rec.index;
    this.length = rec.length;
};

MMScanner.prototype.addError = function (code) {
    if (this.segment.errors === null) this.segment.errors = [];
    this.segment.errors.push(new MMError(this.source, this.token_start, 'scanner', code));
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

// quick and dirty scanner
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
                case '$(':
                    this.addError('nested-comment');
                    break;

                case '$)':
                    comment_state = false;

                    if (state === S_IDLE) {
                        this.segment.type = MMSegment.COMMENT;
                        this.newSegment();
                    }

                    break;

                case '':
                    this.addError('eof-in-comment');
                    comment_state = false;
                    break; // full EOF processing on next loop

                default:
                    if (token.indexOf('$)') >= 0)
                        this.addError('pseudo-comment-end');
                    break;
            }

            continue;
        }

        if (directive_state) {
            if (token === '$]') {
                if (this.include_file === null) {
                    this.addError('missing-filename');
                    break;
                }

                this.includeFile(this.include_file);

                if (state === S_IDLE) {
                    this.segment.type = MMSegment.INCLUDE;
                    this.newSegment();
                }

                break;
            }

            if (token === '') {
                this.addError('unterminated-directive');
                directive_state = false;
                break;
            }

            if (this.include_file !== null) {
                this.addError('directive-too-long');
                break;
            }

            if (token.indexOf('$') >= 0) {
                this.addError('dollar-in-filename');
                break;
            }

            this.include_file = token;
            break;
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
                    this.addError('spurious-period');
                    this.segment.type = MMSegment.BOGUS;
                    this.newSegment();
                }
                state = S_IDLE;
                break;

            case '$=':
                if (state !== S_MATH || this.segment.type !== MMSegment.PROVABLE) {
                    this.addError('spurious-proof');
                    this.segment.type = MMSegment.BOGUS;
                }
                state = S_PROOF;
                this.segment.proof = [];
                break;

            case '$[':
                this.addError('include-unsupported');
                break;

            case '$]':
                this.addError('include-unsupported');
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
                if (token === '' && this.queue.length) {
                    // file switch: need not interrupt a statement

                    if (state === S_IDLE && this.hasSpans()) {
                        this.segment.type = MMSegment.EOF;
                        this.newSegment();
                    }

                    this.nextSource();
                    break;
                }

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

                if (KW_LABEL[token]) {
                    if (state !== S_LABEL) this.addError('missing-label');
                }
                else {
                    if (state === S_LABEL) this.addError('spurious-label');
                }

                this.segment.type = KW_TYPE[token];

                if (KW_ATOMIC[token]) {
                    this.newSegment();
                    state = S_IDLE;
                    if (token === '') return;
                }
                else {
                    state = S_MATH;
                    this.segment.math = [];
                }
                break;

            default:
                if (token.indexOf('$') >= 0) {
                    this.addError('pseudo-keyword');
                    break;
                }

                if (state === S_IDLE) {
                    this.segment.label = token;
                    state = S_LABEL;
                }
                else if (state === S_LABEL) {
                    this.addError('duplicate-label');
                    this.segment.label = token;
                }
                else if (state === S_MATH) {
                    this.segment.math.push(token);
                }
                else if (state === S_PROOF) {
                    this.segment.proof.push(token);
                }
                break;
        }
    }
};

return {
    Source: MMSource,
    Error: MMError,
    Segment: MMSegment,
    Scanner: MMScanner,
};

});
