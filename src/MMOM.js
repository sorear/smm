if (typeof define !== 'function') { var define = require('amdefine')(module) }

define([], function () {
'use strict';

// This data model is fairly similar to that used by METAMATH.C, although we
// make statement-level comments their own kind of segment.

function MMSource(string) {
    this.text = string;
    this.eolMaps = null;
}

// hot inner loop, avoid stuff that could deopt
function eolScan(string, array, sfirst, send, afirst) {
    var slen = string.length;
    while (sfirst < send) {
        var ch = string.charCodeAt(sfirst++);
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

    return [sfirst, afirst];
}

// get indices of all linebreaks in the string
function getEolArray(string) {
    var out = [], sfirst = 0;

    out.push(new Int32Array([0]));

    while (sfirst < string.length) {
        var alen = Math.max(100, string.length / 100);
        var acur = new Int32Array(alen);
        var aix  = 0;

        while (sfirst < string.length && (alen - aix) >= 50) {
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

    return [ low+skip+1, the_map[low] ];
};

function MMSegment() {
    this.type = MMSegment.EOF;
    this.raw = null;
    this.label = null;
    this.math = null;
    this.proof = null;
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

function MMScanner(text) {
    this.text = text;
    this.source = new MMSource(text);
    this.index = 0;
    this.token_start = 0;
    this.segment = new MMSegment();
    this.segment_start = 0;
    this.segments = [];
}

MMScanner.prototype.getToken = function () {
    var ix = this.index, str = this.text, len = str.length, start = ix, chr;

    while (ix < len && " \t\r\f\n".indexOf(str[ix]) >= 0) ix++;
    this.token_start = ix;
    while (ix < len && " \t\r\f\n".indexOf(chr = str[ix]) < 0) {
        if (chr < ' ' || chr > '~') this.addError('bad-character');
        ix++;
    }

    this.index = ix;
    return str.substring(start, ix);
};

MMScanner.prototype.addError = function (code) {
    TODO;
};

MMScanner.prototype.newSegment = function () {
    this.segment.raw = this.text.substring(this.segment_start, this.index);
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

// quick and dirty scanner, will replace with a streaming and $[ aware one later
MMScanner.prototype.scan = function () {
    var in_comment;
    var S_IDLE=1,S_LABEL=2,S_MATH=3,S_PROOF=4;
    var segment_start = 0;
    var state=S_IDLE;
    var token;

    // note: this version of the loop tokenizes everything, even comments and proofs, which is somewhat wasteful
    while (true) {
        token = this.getToken();

        if (in_comment) {
            switch (token) {
                case '$(':
                    this.addError('nested-comment');
                    break;

                case '$)':
                    in_comment = false;

                    if (state === S_IDLE) {
                        this.segment.type = MMSegment.COMMENT;
                        this.newSegment();
                    }

                    break;

                case '':
                    this.addError('eof-in-comment');
                    in_comment = false;
                    break; // full EOF processing on next loop

                default:
                    if (token.indexOf('$)') >= 0)
                        this.addError('pseudo-comment-end');
                    break;
            }
        }
        else {
            switch (token) {
                case '$(':
                    in_comment = true;
                    break;

                case '$)':
                    this.addError('loose-comment-end');
                    break;

                case '$.';
                    if (state === S_MATH || state === S_PROOF) {
                        if (type === PROVABLE && state === S_MATH) {
                            this.addError('missing-proof');
                        }
                        this.newSegment();
                    }
                    else {
                        this.addError('spurious-period');
                        this.segment.type = MMSegment.BOGUS;
                        this.newSegment();
                    }
                    break;

                case '$=':
                    if (state !== S_MATH || this.segment.type === MMSegment.PROVABLE) {
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

                case '$a';
                case '$c';
                case '$d';
                case '$e';
                case '$f';
                case '$p';
                case '$v';
                case '${':
                case '$}':
                case '':
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
    }
}
