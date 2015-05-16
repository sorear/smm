if (typeof define !== 'function') { var define = require('amdefine')(module) }if (typeof define !== 'function') { var define = require('amdefine')(module) }
define(['BigInt'], function (BigInt) {
'use strict';
// Implementation of the persistent string family from Alstrup, Brodal, Rauhe "Dynamic Pattern Matching", section 4 and the appendix

var bn_zero = BigInt.int2bigInt(0,1);
var bn_one = BigInt.int2bigInt(1,1);
var bn_too_big = BigInt.int2bigInt(Math.pow(2,52),53);
function bn_add(x,y) { return BigInt.add(x,y); }
function bn_add1(x) { return BigInt.addInt(x,1); }
function bn_equal1(x) { return BigInt.equalsInt(x,1); }
function bn_tostr(x) { return BigInt.bigInt2str(x,10); }
function bn_tokey(x) { return BigInt.bigInt2str(x,-1); }
function bn_tonum(x) { var r = BigInt.greater(bn_too_big,x) ? Infinity : +bn_tostr(x); return r; }
function bn_greaterequal(x,y) { return BigInt.greater(x,y) || BigInt.equals(x,y); }
function bn_greater(x,y) { return BigInt.greater(x,y); }
function bn_equal(x,y) { return BigInt.equals(x,y); }
function bn_sub1(x) { return BigInt.sub(x,bn_one); }
function bn_greater1(x) { return BigInt.greater(x,bn_one); }
function bn_sub(x,y) { return BigInt.sub(x,y); }
function bn_mul(x,y) { return BigInt.mult(x,y); }
function bn_upgrade(x) { return typeof x === 'number' ? BigInt.int2bigInt(x,52) : x; }
function bn_floordiv(x,y) {
    var q = BigInt.dup(x);
    var r = BigInt.dup(x);
    BigInt.divide_(x,y,q,r);
    return q;
}


// Enumeration of constant-weight codewords::
// 4703 is the smallest prime where this hash table is collision-free
var JUMP_TBL, THREE_OF_SEVEN, UNPOW2;
function calcJumpTbl() {
    var out = new Int32Array(4703);

    for (var zeros = 0; zeros < 32; zeros++) {
        for (var ones = 1; ones < (31 - zeros); ones++) {
            var above0 = (1 << zeros), above1 = (1 << (ones + zeros));
            out[ (above1 - above0 + above1) % 4703 ] = (above1 + (1 << (ones - 1)) - 1) - (above1 - above0);
        }
    }

    JUMP_TBL = out;
    THREE_OF_SEVEN = new Int32Array(35);
    for (var i = 0, j = 7; i < 35; i++, j = nextSameWeight(j))
        THREE_OF_SEVEN[i] = j;

    UNPOW2 = new Int32Array(37);
    for (var i = 0; i < 30; i++) {
        UNPOW2[ (1 << i) % 37 ] = i;
    }

    return out;
}

function nextSameWeight(i) {
    // if the input is xxxx0111000, (i|(i-1)) gives us xxxx0111111, adding 1 and xor gives us the entire portion to increment tagged with a top bit
    // table returns enough to increase to 1000011
    JUMP_TBL || calcJumpTbl();
    return i + JUMP_TBL[(((i | (i-1)) + 1) ^ i) % 4703];
}

// ABR preliminary: Consistent derandomized segmentation
// color reduction: why constant-weight codewords work, and why they are optimal (antichain argument)

function ABRStringStore() {
    JUMP_TBL || calcJumpTbl();
    // allocate storage for cons table
    this._singletons = new Map();
    this._blocks = {};
    this._runs = new Map();
    this._nextCode = 0x7FFF; // 16-of-31 code gives about 2^28 nodes; we run into sign bit trouble past that

    this.emptyString = new ABRStringNode(this, -1, null);
    this.emptyString.length = bn_zero;
}

// depth -1: Epsilon node, content is null
// depth 0: Singletons, content is some object
// depth 1,3,...: Run nodes, content is [repeat, child]
// depth 2,4,...: Segment nodes, content is [all children]
function ABRStringNode(store, depth, content) {
    this.depth = depth;
    this.content = content;
    this.length = null;
    this.repeat = bn_zero;
    if (depth >= 0) {
        this.code = store._nextCode;
        if (store._nextCode == 0x7FFF0000) throw new Error('ABR Tree is full');
        store._nextCode = nextSameWeight(store._nextCode);
    }
    else {
        this.code = 0;
    }
    //console.log(this);
    //console.trace('MK',store.dump(this));
}

ABRStringStore._nextSameWeight = nextSameWeight;

// note that 'char' need not actually be a character
ABRStringStore.prototype.singleton = function (ch) {
    if (this._singletons.has(ch)) {
        return this._singletons.get(ch);
    }
    else {
        var sng = new ABRStringNode(this, 0, ch);
        sng.length = bn_one;
        this._singletons.set(ch, sng);
        return sng;
    }
};

ABRStringStore.prototype.dump = function (node) {
    var out = [];
    var next_alias = 1;
    var used_once = new Set();
    var alias_map = new Map();

    var scan = function (nn) {
        if (alias_map.has(nn)) return;
        if (used_once.has(nn)) {
            alias_map.set(nn, next_alias++);
            return;
        }
        used_once.add(nn);
        if (nn.depth <= 0) return;
        else if (nn.depth & 1) scan(nn.content);
        else nn.content.forEach(scan);
    };

    var render = function (nn) {
        if (alias_map.has(nn)) {
            if (used_once.has(nn)) {
                out.push('$'+alias_map.get(nn));
                return;
            }
            else {
                out.push('#'+alias_map.get(nn)+'=');
                used_once.add(nn);
            }
        }

        if (nn.depth < 0) {
            out.push('!E');
        }
        else if (nn.depth == 0) {
            out.push(nn.content.toString());
        }
        else if (nn.depth & 1) {
            render(nn.content);
            if (!bn_equal1(nn.repeat)) out.push('(*'+bn_tostr(nn.repeat)+')');
        }
        else {
            out.push('[');
            nn.content.forEach(function (nnn,ix) {
                if (ix) out.push(' ');
                render(nnn);
            });
            out.push(']');
        }
    };

    scan(node);
    used_once.clear();
    render(node);
    return out.join('');
};

ABRStringStore.prototype.toArray = function (node, out, maxLen) {
    out = out || [];
    maxLen = maxLen || 10000;
    if (node.depth < 0 || out.length >= maxLen) {
        //no action
    }
    else if (node.depth === 0) {
        out.push(node.content);
    }
    else if (node.depth & 1) {
        var count = bn_tonum(node.repeat);
        while (out.length < maxLen && count--) {
            this.toArray(node.content,out,maxLen);
        }
    }
    else {
        node.content.forEach(function (nn) {
            this.toArray(nn,out,maxLen);
        }, this);
    }
    return out;
};

// We use a 2-step range compaction process, first employing the node codes to
// reduce to 31 cases, then using THREE_OF_SEVEN to go to 7.  Local maxima are
// then extracted, giving an extreme block of 14; but we need to look one
// further to the left to force the first two flags to 0 1
var DELTA_L = 3, DELTA_R = 1;
var CONCAT_WINDOW = 2 + DELTA_L + DELTA_R;

// The concat algorithm from the paper, except that the paper only handled
// same-depth concatenation
ABRStringStore.prototype.concat = function (x,y) {
    // empty string cases
    if (x.depth < 0) return y;
    if (y.depth < 0) return x;
    return this._uproot(concatRecurse(this,[x],[y]));
};

// left_suf contains the last K_L signatures at depth i, or the single
// signature at a depth below that.  likewise right_pref for first K_R.
// returns a vector of depth i signatures representing the concatenation.
// may destroy left_suf, right_suf.
function concatRecurse(me, left_suf, right_pref) {
    var left_depth = left_suf[0].depth, right_depth = right_pref[0].depth;
    var max_depth = Math.max(left_depth, right_depth);

    if (max_depth === 0) {
        // trivial case
        return left_suf.concat(right_pref);
    }

    // otherwise we need to partially expand one or both, recurse, and
    // recombine.  the recursive call needs K_L depth i-1 signatures from
    // the left side, so (if the left side has depth greater than i-1), we
    // expand our signatures into 2-14 K_L runs, then pull K_L signatures
    // off the right.  this modifies up to K_L+1 runs and thus potentially
    // changes segment flags back to K_L+1+DELTA_R, and doing the
    // recalculation requires K_L+1+DELTA_R+DELTA_L runs to be visible.  To
    // ensure this, and expand one additional segment to guarantee a
    // segment-begin run, we must expand >=1+ceil((K_L+1+D_R+D_L)/2)
    // (relaxed to >= 1 + (K_L+2+D_R+D_L)/2) segments; this constrains
    // 2*K_L >= 2 + K_L + D_R + D_L, so we set K_L = 2+D_R+D_L.
    //
    // by symmetry set K_R.

    var left_recurse_buffer, right_recurse_buffer;
    var left_wontchange, right_wontchange;

    if (left_depth === max_depth) {
        left_suf = _segmentToRuns(left_suf); //explode segments in left_suf into tagged runs
        left_wontchange = Math.max(0,left_suf.length - (CONCAT_WINDOW + 1 + DELTA_R)); //mark rightmost CONCAT_WINDOW+1+DELTA_R (the could-change region, incl. retagging)
        left_recurse_buffer = me._runsExtractRight(left_suf, CONCAT_WINDOW); //extract CONCAT_WINDOW right-side depth i-1 signatures
    }
    else {
        left_recurse_buffer = left_suf;
        left_wontchange = 0;
        left_suf = [];
    }

    if (right_depth === max_depth) {
        right_pref = _segmentToRuns(right_pref);
        right_wontchange = Math.max(0,right_pref.length - (CONCAT_WINDOW + 1 + DELTA_L));
        right_recurse_buffer = me._runsExtractLeft(right_pref, CONCAT_WINDOW);
    }
    else {
        right_recurse_buffer = right_pref;
        right_wontchange = 0;
        right_pref = [];
    }

    var recurse_out = concatRecurse(me, left_recurse_buffer, right_recurse_buffer);

    me._runsAppendSigs(left_suf, recurse_out); //convert recurse_out into runs, append to left_suf
    me._runsAppendRuns(left_suf, right_pref); //merge runs from right_pref
    me._computeSegmentation(left_suf, left_wontchange, right_wontchange); //recompute all segmentation symbols betweeen left_wontchange and right_wontchange
    return _runsToSegments(me, left_suf); //convert back to segments
}

function ABRUnpackedRun(run, sig, repeat, start, segm) {
    this.run = run;
    this.sig = sig;
    this.repeat = repeat;
    this.start = start;
    this.segm = segm;
}

// We allow expanded runs to have a null node pointer so that run counts can be manipulated without necessarily re-interning
function _segmentToRuns(segs) {
    var out = [], i, j, seg_ct = segs.length;
    //console.log(segs);
    for (i = 0; i < seg_ct; i++) {
        var s = segs[i], scon = s.content, sconlen = scon.length, ix;
        for (ix = 0; ix < sconlen; ix++) {
            var run_node = scon[ix];
            if (run_node.depth & 1) {
                out.push(new ABRUnpackedRun(run_node, run_node.content, run_node.repeat, ix === 0, s));
            }
            else {
                out.push(new ABRUnpackedRun(run_node, run_node, bn_one, ix === 0, s));
            }
        }
    }
    return out;
};

//destroys argument
function _runsToSegments(me, runs) {
    var out = [];
    var ix = 0;
    while (ix < runs.length) {
        var fastseg = runs[ix].segm;
        var ix2 = ix;
        while (ix2 < runs.length && (ix2 === ix || !runs[ix2].start)) {
            if (!runs[ix2++].segm) {
                fastseg = null;
                break;
            }
        }
        if (fastseg) {
            out.push(fastseg);
            ix = ix2;
            continue;
        }

        var segment = [];
        var hkey = '';
        var first = ix;
        while (ix < runs.length && (ix === first || !runs[ix].start)) {
            var run = runs[ix++].run;
            segment.push(run);
            hkey = hkey + ':' + run.code;
        }
        var ptr = me._blocks;
        fastseg = ptr[hkey];
        if (!fastseg) ptr[hkey] = fastseg = new ABRStringNode(me, (segment[0].depth|1)+1, segment);
        out.push(fastseg);
    }
    return out;
}

ABRStringStore.prototype._runsExtractRight = function (runs,k) {
    var out = [];
    while (k-- && runs.length) {
        var end = runs[runs.length-1];
        if (bn_greater1(end.repeat)) {
            end.repeat = bn_sub1(end.repeat);
            end.run = null;
        }
        else {
            runs.pop();
        }
        out.unshift(end.sig);
    }
    return out;
};

ABRStringStore.prototype._runsExtractLeft = function (runs,k) {
    var out = [];
    while (k-- && runs.length) {
        var end = runs[0];
        if (bn_greater1(end.repeat)) {
            end.repeat = bn_sub1(end.repeat);
            end.run = null;
        }
        else {
            runs.shift();
        }
        out.push(end.sig);
    }
    return out;
};

ABRStringStore.prototype._runsAppendSigs = function (runs,ary) {
    var last = runs.length ? runs[runs.length-1] : null, alen = ary.length, ix;
    for (ix=0; ix < alen; ix++) {
        var sig = ary[ix];
        if (last && last.sig === sig) {
            last.repeat = bn_add1(last.repeat);
            last.run = null;
        }
        else {
            runs.push(last = new ABRUnpackedRun(null, sig, bn_one, false, null));
        }
    }
    return runs;
};

ABRStringStore.prototype._runsPrependSigs = function (runs,ary) {
    runs.reverse();
    ary.reverse();
    this._runsAppendSigs(runs, ary);
    runs.reverse();
    return runs;
};

ABRStringStore.prototype._runsAppendRuns = function (runs,runs2) {
    if (!runs2.length) return;
    var last = runs.length ? runs[runs.length-1] : null;
    if (last && last.sig === runs2[0].sig) {
        last.repeat = bn_add(last.repeat, runs2[0].repeat);
        last.run = null;
        runs2.shift();
    }
    runs.push.apply(runs, runs2);
};

ABRStringStore.prototype._computeSegmentation = function (runs, left_fixed, right_fixed) {
    var codes = [], pack1 = [], pack2 = [];
    var i, rlen = runs.length, endix = Math.min(rlen, rlen-right_fixed+1);

    // lazily create the run nodes
    for (i = left_fixed; i < rlen - right_fixed; i++) {
        runs[i].segm = null;
        if (runs[i].run) continue;
        if (runs[i].repeat === bn_one || bn_equal1(runs[i].repeat)) { runs[i].run = runs[i].sig; continue; }
        var cmap = this._runs.get(runs[i].sig);
        if (!cmap) this._runs.set(runs[i].sig, cmap = new Map());
        var rkey = bn_tokey(runs[i].repeat);
        var rnode = cmap.get(rkey);
        if (!rnode) {
            /*A*/if (bn_equal(runs[i].repeat,bn_zero)) throw 'zero length repeat';
            /*A*/if (runs[i].sig.depth & 1) throw 'tried to make a run of runs';
            cmap.set(rkey, rnode = new ABRStringNode(this, runs[i].sig.depth+1, runs[i].sig));
            rnode.repeat = runs[i].repeat;
        }
        runs[i].run = rnode;
    }

    for (i = Math.max(0,left_fixed-3); i < endix; i++) {
        codes[i+3] = runs[i].run.code;
        //A//if (i > Math.max(0,left_fixed-3) && codes[i+3] === codes[i+2]) throw ['assert: string coloring invariant violated 1'];
    }

    for (i = Math.max(0,left_fixed-2); i < endix; i++) {
        var delta = codes[i+3] & ~(i === 0 ? 0 : codes[i+2]);
        pack1[i+3] = THREE_OF_SEVEN[UNPOW2[ (delta &~ (delta-1)) % 37 ]];
        //A//if (i > Math.max(0,left_fixed-2) && pack1[i+3] === pack1[i+2]) throw ['assert: string coloring invariant violated 2'];
    }

    for (i = Math.max(0,left_fixed-1); i < endix; i++) {
        var delta = pack1[i+3] & ~(i === 0 ? 0 : pack1[i+2]);
        pack2[i+3] = UNPOW2[ (delta &~ (delta-1)) % 37 ];
        //A//if (i > Math.max(0,left_fixed-1) && pack2[i+3] === pack2[i+2]) throw ['assert: string coloring invariant violated 3'];
    }

    // pack2 is 0-6 coded now.  hunt for local maxima
    // since DELTA_L = 3, we're guaranteed to know if we are in the first two slots (which require special treatment)

    for (i = left_fixed; i < rlen - right_fixed; i++) {
        runs[i].start = (i === 0 || (i !== 1 && i !== (rlen-1) && pack2[i+3] > pack2[i+2] && pack2[i+3] > pack2[i+4]));
    }
    //console.log(runs,codes,pack1,pack2,left_fixed,right_fixed);
};

ABRStringStore.prototype._uproot = function (roots) {
    while (roots.length > 1) {
        // else we need to increase depth here.
        roots = this._runsAppendSigs([], roots); //convert to runs
        this._computeSegmentation(roots, 0, 0); //calculate segment borders
        roots = _runsToSegments(this,roots); //convert to segments
    }
    while (roots[0].depth > 0 && roots[0].content.length === 1 && !(roots[0].content[0].depth & 1)) {
        roots[0] = roots[0].content[0];
    }
    return roots[0];
};

var SPLIT_L_COUNT = DELTA_L + DELTA_R + 2;
var SPLIT_R_COUNT = DELTA_L + DELTA_R + 2;
ABRStringStore.prototype.split = function (str, ix) {
    //console.log(me.dump(str),ix);
    ix = bn_upgrade(ix);
    if (bn_greaterequal(bn_zero,ix)) return [this.emptyString, str];
    if (bn_greaterequal(ix,this.lengthBig(str))) return [str, this.emptyString];

    var r_out = splitRecurse(this,[str],[],ix);
    return [ this._uproot(r_out[0]), this._uproot(r_out[1]) ];
};

// lsigs contains only sigs that overlap or are left of the cut
// lsigs+rsigs contains all sigs to recompute and all context
// after expanding "L" lsigs and having an effective depth of 2L it must be able to satisfy a cut of "L+1" for the recursion and rejoining while keeping a depth of DELTA_L+DELTA_R so that all can be recomputed; the left sentinel is necessarily untouched provided DELTA_L >= 1
function splitRecurse(me,lsigs, rsigs, cut) {
    //console.log(lsigs.map(me.dump,me), rsigs.map(me.dump,me), cut);
    var lsigs_len = bn_zero;
    lsigs.forEach(function (ls) { lsigs_len = bn_add(lsigs_len,me.lengthBig(ls)); });

    if (lsigs[0].depth === 0) return [lsigs, rsigs]; // base case

    // explode lsig and rsig to sigpowers
    lsigs = _segmentToRuns(lsigs);
    rsigs = _segmentToRuns(rsigs);

    // move sigs to rsig as the cut descends
    while (true) {
        var lsigs_last = lsigs[lsigs.length-1], lsigs_last_len = me.lengthBig(lsigs_last.sig);
        var surplus = bn_sub(lsigs_len, cut);
        if (bn_greater(lsigs_last_len, surplus)) break;

        var rem = bn_floordiv(surplus, lsigs_last_len);

        if (bn_greaterequal(rem, lsigs_last.repeat)) {
            lsigs.pop();
            lsigs_len = bn_sub(lsigs_len, bn_mul(lsigs_last_len, lsigs_last.repeat));
            rsigs.unshift(lsigs_last);
        }
        else {
            lsigs_len = bn_sub(lsigs_len, bn_mul(lsigs_last_len, rem));
            lsigs_last.repeat = bn_sub(lsigs_last.repeat, rem);
            lsigs_last.run = null;
            rsigs.unshift(new ABRUnpackedRun(null, lsigs_last.sig, rem, false, null));
            break;
        }
    }

    // mark will-not-be-modified region on each side; note, there may be 1 dirty entry on each side already
    var left_wontchange = Math.max(0,lsigs.length - (SPLIT_L_COUNT + 1 + DELTA_R));
    var right_wontchange = Math.max(0,rsigs.length - (SPLIT_R_COUNT + 1 + DELTA_L));

    var left_ex = me._runsExtractRight(lsigs, SPLIT_L_COUNT);
    left_ex.forEach(function (lex) { lsigs_len = bn_sub(lsigs_len, me.lengthBig(lex)); });
    // de-RLE a recursion buffer on each side
    var recursed = splitRecurse(me,left_ex, me._runsExtractLeft(rsigs, SPLIT_R_COUNT), bn_sub(cut, lsigs_len));

    // re-RLE, recompute segmentation, return
    me._runsAppendSigs(lsigs, recursed[0]);
    me._runsPrependSigs(rsigs, recursed[1]);
    me._computeSegmentation(lsigs, left_wontchange, 0);
    me._computeSegmentation(rsigs, 0, right_wontchange);
    return [_runsToSegments(me,lsigs), _runsToSegments(me,rsigs)];
}

ABRStringStore.prototype.fromArray = function (a) {
    if (!a.length) return this.emptyString;
    return this._uproot(a.map(this.singleton.bind(this)));
};

ABRStringStore.prototype.length = function (nn) {
    return bn_tonum(this.lengthBig(nn));
};

ABRStringStore.prototype.lengthBig = function (nn) {
    if (nn.length !== null) return nn.length;
    if (nn.depth & 1) {
        return nn.length = bn_mul(nn.repeat, this.lengthBig(nn.content));
    }
    else {
        var len = bn_zero;
        nn.content.forEach(function (nn2) { len = bn_add(len, this.lengthBig(nn2)); }, this);
        return nn.length = len;
    }
};

return ABRStringStore;
});
