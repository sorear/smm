define(['./BigNat'], function (BigNat) {
// Implementation of the persistent string family from Alstrup, Brodal, Rauhe "Dynamic Pattern Matching", section 4 and the appendix

// Enumeration of constant-weight codewords::
// 4703 is the smallest prime where this hash table is collision-free
var JUMP_TBL;
var THREE_OF_SEVEN;
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
}

ABRStringStore._nextSameWeight = nextSameWeight;

// note that 'char' need not actually be a character
ABRStringStore.prototype.singleton = function (ch) {
    if (this._singletons.has(ch)) {
        return this._singletons.get(ch);
    }
    else {
        var sng = new ABRStringNode(this, 0, ch);
        this._singletons.put(ch, sng);
        return sng;
    }
};

// We use a 2-step range compaction process, first employing the node codes to
// reduce to 32 cases, then using THREE_OF_SEVEN to go to 7.  Local maxima are
// then extracted, giving an extreme block of 14 and DELTA_L = DELTA_R = 2.
var DELTA_L = 2, DELTA_R = 2;

// The concat algorithm from the paper
ABRStringStore.prototype.concat2 = function (x,y) {
};

ABRStringStore.prototype.concat = function (strings) {
    var nonempty_strings = strings.filter(function (n) { return n.depth >= 0; });
    var pieces = [];

    // Start by 'unraveling' all portions of each input that might need to change
    nonempty_strings.forEach(function (str, ix) {
        
    }, this);
};

// API string from array
// concatenate, equality, compare, split

return ABRStringStore;
});
