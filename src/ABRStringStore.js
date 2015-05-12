define(['./BigNat'], function (BigNat) {
'use strict';
// Implementation of the persistent string family from Alstrup, Brodal, Rauhe "Dynamic Pattern Matching", section 4 and the appendix

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
    this._blocks = new Map();
    this._runs = new Map();
    this._nextCode = 0x7FFF; // 16-of-31 code gives about 2^28 nodes; we run into sign bit trouble past that

    this.emptyString = new ABRStringNode(this, -1, null);
}

// depth -1: Epsilon node, content is null
// depth 0: Singletons, content is some object
// depth 1,3,...: Run nodes, content is [repeat, child]
// depth 2,4,...: Segment nodes, content is [all children]
function ABRStringNode(store, depth, content) {
    this.depth = depth;
    this.content = content;
    this.length = null;
    if (depth >= 0) {
        this.code = store._nextCode;
        if (store._nextCode == 0x7FFF0000) throw new Error('ABR Tree is full');
        store._nextCode = nextSameWeight(store._nextCode);
    }
    else {
        this.code = 0;
    }
    //console.log(this);
    //console.log(store.dump(this));
}

ABRStringStore._nextSameWeight = nextSameWeight;

// note that 'char' need not actually be a character
ABRStringStore.prototype.singleton = function (ch) {
    if (this._singletons.has(ch)) {
        return this._singletons.get(ch);
    }
    else {
        var sng = new ABRStringNode(this, 0, ch);
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
        else if (nn.depth & 1) scan(nn.content[1]);
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
            render(nn.content[1]);
            if (nn.content[0] !== 1) out.push('(*'+nn.content[0]+')'); //BIGNUM
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
        var count = node.content[0];
        while (out.length < maxLen && count--) { //BIGNUM
            this.toArray(node.content[1],out,maxLen);
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
var DELTA_L = 4, DELTA_R = 1;
var CONCAT_WINDOW = 2 + DELTA_L + DELTA_R;

// The concat algorithm from the paper, except that the paper only handled
// same-depth concatenation
ABRStringStore.prototype.concat = function (x,y) {
    // empty string cases
    if (x.depth < 0) return y;
    if (y.depth < 0) return x;
    var me = this;

    // left_suf contains the last K_L signatures at depth i, or the single
    // signature at a depth below that.  likewise right_pref for first K_R.
    // returns a vector of depth i signatures representing the concatenation.
    // may destroy left_suf, right_suf.
    var recurse = function (left_suf, right_pref) {
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
            left_suf = me._segmentToRuns(left_suf); //explode segments in left_suf into tagged runs
            left_wontchange = Math.max(0,left_suf.length - (CONCAT_WINDOW + 1 + DELTA_R)); //mark rightmost CONCAT_WINDOW+1+DELTA_R (the could-change region, incl. retagging)
            left_recurse_buffer = me._runsExtractRight(left_suf, CONCAT_WINDOW); //extract CONCAT_WINDOW right-side depth i-1 signatures
        }
        else {
            left_recurse_buffer = left_suf;
            left_wontchange = 0;
            left_suf = [];
        }

        if (right_depth === max_depth) {
            right_pref = me._segmentToRuns(right_pref);
            right_wontchange = Math.max(0,right_pref.length - (CONCAT_WINDOW + 1 + DELTA_L));
            right_recurse_buffer = me._runsExtractLeft(right_pref, CONCAT_WINDOW);
        }
        else {
            right_recurse_buffer = right_pref;
            right_wontchange = 0;
            right_pref = [];
        }

        var recurse_out = recurse(left_recurse_buffer, right_recurse_buffer);

        me._runsAppendSigs(left_suf, recurse_out); //convert recurse_out into runs, append to left_suf
        me._runsAppendRuns(left_suf, right_pref); //merge runs from right_pref
        me._computeSegmentation(left_suf, left_wontchange, right_wontchange); //recompute all segmentation symbols betweeen left_wontchange and right_wontchange
        return me._runsToSegments(left_suf); //convert back to segments
    };

    var new_roots = recurse([x],[y]);

    if (new_roots.length === 1) {
        return new_roots[0];
    }
    else {
        // uprooting: also a case not mentioned in the paper
        return me._uproot(recurse([x],[y]));
    }
};

// We allow expanded runs to have a null node pointer so that run counts can be manipulated without necessarily re-interning
ABRStringStore.prototype._segmentToRuns = function (segs) {
    var out = [];
    segs.forEach(function (s) {
        s.content.forEach(function (run_node, ix) {
            out.push({ run: run_node, sig: run_node.content[1], repeat: run_node.content[0], start: ix === 0 });
        });
    });
    return out;
};

//destroys argument
ABRStringStore.prototype._runsToSegments = function (runs) {
    var out = [];
    var ix = 0;
    while (ix < runs.length) {
        var segment = [];
        var first = ix;
        var ptr = this._blocks;
        while (ix < runs.length && (ix === first || !runs[ix].start)) {
            var run = runs[ix++];
            segment.push(run.run);
            if (!ptr.has(run.run)) ptr.set(run.run, new Map()); // grossly inefficient
            ptr = ptr.get(run.run);
        }

        if (!ptr.has(null)) {
            ptr.set(null, new ABRStringNode(this, segment[0].depth+1, segment));
        }
        out.push(ptr.get(null));
    }
    return out;
};

ABRStringStore.prototype._runsExtractRight = function (runs,k) {
    var out = [];
    while (k-- && runs.length) {
        var end = runs[runs.length-1];
        if (end.repeat > 1) {
            end.repeat--;
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
        if (end.repeat > 1) {
            end.repeat--;
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
    var last = runs.length ? runs[runs.length-1] : null;
    ary.forEach(function (sig) {
        if (last && last.sig === sig) {
            last.repeat++; //BIGNUM
            last.run = null;
        }
        else {
            runs.push(last = { run: null, sig: sig, repeat: 1, start: false });
        }
    });
    return runs;
};

ABRStringStore.prototype._runsAppendRuns = function (runs,runs2) {
    if (!runs2.length) return;
    var last = runs.length ? runs[runs.length-1] : null;
    if (last && last.sig === runs2[0].sig) {
        last.repeat += runs2[0].repeat; //BIGNUM;
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
        if (runs[i].run) continue;
        var cmap = this._runs.get(runs[i].sig);
        if (!cmap) this._runs.set(runs[i].sig, cmap = new Map());
        var rnode = cmap.get(runs[i].repeat); //BIGNUM
        if (!rnode) cmap.set(runs[i].repeat, rnode = new ABRStringNode(this, runs[i].sig.depth+1, [runs[i].repeat, runs[i].sig]));
        runs[i].run = rnode;
    }

    //console.log(runs, left_fixed, right_fixed);
    for (i = Math.max(0,left_fixed-3); i < endix; i++) {
        codes[i+3] = runs[i].run.code;
    }

    for (i = Math.max(0,left_fixed-2); i < endix; i++) {
        var delta = codes[i+3] & ~(i === 0 ? 0 : codes[i+2]);
        pack1[i+3] = THREE_OF_SEVEN[UNPOW2[ (delta &~ (delta-1)) % 37 ]];
    }

    for (i = Math.max(0,left_fixed-1); i < endix; i++) {
        var delta = pack1[i+3] & ~(i === 0 ? 0 : pack1[i+2]);
        pack2[i+3] = UNPOW2[ (delta &~ (delta-1)) % 37 ];
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
        roots = this._runsToSegments(roots); //convert to segments
    }
    return roots[0];
};

ABRStringStore.prototype.fromArray = function (a) {
    if (!a.length) return this.emptyString;
    return this._uproot(a.map(this.singleton.bind(this)));
};

// API string from array
// concatenate, equality, compare, split

return ABRStringStore;
});
