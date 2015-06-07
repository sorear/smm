if (typeof define !== 'function') { var define = require('amdefine')(module) }

// This module collects information to perform name resolution and (extended) frame construction for statements

define(['./MMOM'], function (mmom) {
'use strict';

function MMScoper(db) {
    this.db = db;
    this.ends_chains_ary = null;
    this.errors = null;
    this.symtab = null;
}

MMScoper.install = function (db) {
    return db.plugins.scoper = new MMScoper(db);
};

// track for:
// math symbols: relevant $c/$v/$f list
// labels: pointer to definition ($e/$f/$a/$p)
// $a/$p: pink number, frame-building info ($e chain, $d chain)
// $e: $e chain, active range
// $f: active range
// $d: $d chain

var PROVABLE = mmom.Segment.PROVABLE;
var AXIOM = mmom.Segment.AXIOM;
var OPEN = mmom.Segment.OPEN;
var CLOSE = mmom.Segment.CLOSE;
var VAR = mmom.Segment.VAR;
var CONST = mmom.Segment.CONST;
var ESSEN = mmom.Segment.ESSEN;
var FLOAT = mmom.Segment.FLOAT;
var DV = mmom.Segment.DV;

MMScoper.prototype.getPos = function (pos,ix) {
    return pos.slice(2*ix,2*ix+2);
};

MMScoper.prototype.addError = function (pos,ix,code,data) {
    this.errors.push(new mmom.Error(pos[2*ix], pos[2*ix+1], 'scope', code, data));
};

// note, even with invalid input we do not allow the symbol table to contain overlapping active ranges for $v/$f.  so it is only necessary to check the last math entry
MMScoper.prototype.getSym = function (label) {
    var symtab = this.symtab;
    return symtab[label] || (symtab[label] = { labelled: -1, math: [], mathix: [], float: [] });
};

MMScoper.prototype.labelCheck = function (segix) {
    // error if label already used
    // error if label exists as a math symbol
    // record label
    var segtab = this.db.segments;
    var sym = this.getSym(segtab[segix].label);
    if (sym.labelled >= 0) {
        this.addError(segtab[segix].startPos, 0, 'label-used-twice', { prev: this.getPos(segtab[sym.labelled].startPos, 0) });
        return;
    }

    if (sym.math.length) {
        this.addError(segtab[segix].startPos, 0, 'math-then-label', { prev: this.getPos(segtab[sym.math[0]].mathPos, sym.mathix[0]) });
    }

    sym.labelled = segix;
};

var HIGHSEG = -1 >>> 1;
// MM files larger than 2GB are likely to cause no end of problems...

MMScoper.prototype.mathCheck = function (segix) {
    // EAP math string check (all tokens active, first constant, active $f for each variable)

    var segtab = this.db.segments;
    var seg = segtab[segix];
    var ends_chains_ary = this.ends_chains_ary;
    var i, sym, checked;

    if (seg.math.length === 0) {
        this.addError(seg.startPos, 0, 'eap-empty');
        return;
    }

    checked = { __proto__: null };
    for (i = 0; i < seg.math.length; i++) {
        if (seg.math[i] in checked) continue;
        checked[seg.math[i]] = true;

        sym = this.getSym(seg.math[i]);

        if (!sym.math.length || ends_chains_ary[sym.math[sym.math.length - 1]] !== HIGHSEG) {
            this.addError(seg.mathPos, i, 'eap-not-active-sym');
            continue;
        }

        if (segtab[sym.math[sym.math.length - 1]].type === VAR) {
            if (i === 0) {
                this.addError(seg.mathPos, 0, 'eap-first-not-const');
                // can only get away with this impurity because it's first
            }

            if (!sym.float.length || ends_chains_ary[sym.float[sym.float.length - 1]] !== HIGHSEG) {
                this.addError(seg.mathPos, i, 'eap-no-active-float');
            }
        }
    }
};

MMScoper.prototype.scan = function () {
    var segix, segments = this.db.segments, seg;
    var open_vf_stack = []; // includes a -1 sentinel for each open scope
    var open_ed_ptr = -1;
    var scope_ed_stack = [];
    var open_stack = [];
    var i, j;
    this.errors = [];
    var ends_chains_ary = this.ends_chains_ary = new Int32Array(segments.length); // chain for edap, end for fv
    this.symtab = { __proto__: null };
    var used;
    var sym;

    for (segix = 0; segix < segments.length; segix++) {
        seg = segments[segix];

        switch (seg.type) {
            case OPEN:
                // save e/d chain and close stack top, no error conditions
                scope_ed_stack.push(open_ed_ptr);
                open_vf_stack.push(-1);
                open_stack.push(seg);
                break;

            case CLOSE:
                // error if stack empty
                // pop stacks, set end numbers for statements above new close stack top, restore e/d chain
                if (scope_ed_stack.length) {
                    while ((i = open_vf_stack.pop()) >= 0) {
                        ends_chains_ary[i] = segix;
                    }
                    open_ed_ptr = scope_ed_stack.pop();
                    open_stack.pop();
                }
                else {
                    this.addError(seg.startPos, 0, 'close-stack-empty');
                }
                break;

            case CONST:
                if (seg.math.length === 0)
                    this.addError(seg.startPos, 0, 'const-empty');
                if (scope_ed_stack.length)
                    this.addError(seg.startPos, 0, 'const-not-top-scope');
                ends_chains_ary[segix] = HIGHSEG;
                // error if not top scope
                for (i = 0; i < seg.math.length; i++) {
                    sym = this.getSym(seg.math[i]);
                    if (sym.labelled >= 0) {
                        this.addError(seg.mathPos, i, 'label-then-const', { prev: this.getPos(segments[sym.labelled].startPos, 0) });
                    }

                    if (sym.math.length) {
                        this.addError(seg.mathPos, i, 'math-then-const', { prev: this.getPos(segments[sym.math[0]].mathPos, sym.mathix[0]) });
                        // error if already used, and DON'T add to symbol table
                    }
                    else {
                        // add math token
                        sym.math.push(segix);
                        sym.mathix.push(i);
                    }
                }
                break;

            case VAR:
                if (seg.math.length === 0)
                    this.addError(seg.startPos, 0, 'var-empty');
                ends_chains_ary[segix] = HIGHSEG;
                for (i = 0; i < seg.math.length; i++) {
                    sym = this.getSym(seg.math[i]);
                    if (sym.labelled >= 0) {
                        this.addError(seg.mathPos, i, 'label-then-var', { prev: this.getPos(segments[sym.labelled].startPos, 0) });
                    }

                    if (sym.math.length && ends_chains_ary[sym.math[sym.math.length - 1]] === HIGHSEG) {
                        // still active
                        this.addError(seg.mathPos, i, 'math-then-var', { prev: this.getPos(segments[sym.math[sym.math.length - 1]].mathPos, sym.mathix[sym.math.length - 1]) });
                    }
                    else {
                        // add math token
                        sym.math.push(segix);
                        sym.mathix.push(i);
                    }
                }
                open_vf_stack.push(segix);
                break;

            case ESSEN:
                this.labelCheck(segix);
                this.mathCheck(segix);
                ends_chains_ary[segix] = open_ed_ptr;
                open_ed_ptr = segix;
                break;

            case FLOAT:
                this.labelCheck(segix);
                open_vf_stack.push(segix);
                ends_chains_ary[segix] = HIGHSEG;
                if (seg.math.length !== 2) {
                    this.addError(seg.startPos, 0, 'float-format');
                    break;
                }
                sym = this.getSym(seg.math[0]);
                if (!sym.math.length || ends_chains_ary[sym.math[sym.math.length - 1]] !== HIGHSEG || segments[sym.math[sym.math.length - 1]].type !== CONST) {
                    this.addError(seg.mathPos, 0, 'float-not-active-const');
                    break;
                }
                sym = this.getSym(seg.math[1]);
                if (!sym.math.length || ends_chains_ary[sym.math[sym.math.length - 1]] !== HIGHSEG || segments[sym.math[sym.math.length - 1]].type !== VAR) {
                    this.addError(seg.mathPos, 1, 'float-not-active-var');
                    break;
                }
                if (sym.float.length && ends_chains_ary[sym.float[sym.float.length - 1]] === HIGHSEG) {
                    this.addError(seg.mathPos, 1, 'float-active-float', { prev: this.getPos(segments[sym.float[sym.float.length - 1]].startPos, 0) });
                    break;
                }
                sym.float.push(segix);
                break;

            case DV:
                if (seg.math.length < 2)
                    this.addError(seg.startPos, 0, 'dv-short');
                used = { __proto__: null };
                for (var i = 0; i < seg.math.length; i++) {
                    if (seg.math[i] in used) {
                        this.addError(seg.mathPos, i, 'dv-repeated', { prev: this.getPos(seg.mathPos, used[seg.math[i]]) });
                        continue;
                    }
                    used[seg.math[i]] = i;
                    sym = this.getSym(seg.math[i]);
                    if (sym.math.length && segments[sym.math[sym.math.length - 1]].type === VAR && ends_chains_ary[sym.math[sym.math.length - 1]] === HIGHSEG) {
                        // active $v
                    }
                    else {
                        this.addError(seg.mathPos, i, 'dv-not-active-var');
                    }
                }
                // add to e/d chain
                ends_chains_ary[segix] = open_ed_ptr;
                open_ed_ptr = segix;
                break;

            case AXIOM:
            case PROVABLE:
                this.labelCheck(segix);
                this.mathCheck(segix);
                ends_chains_ary[segix] = open_ed_ptr;
                break;
        }
    }

    // error if scope stack not empty
    for (i = 0; i < open_stack.length; i++) {
        this.addError(open_stack[i].startPos, 0, 'never-closed');
    }
};

function MMFrame() {
}

MMScoper.prototype.getFrame = function (seg) {
    // walk chain to find relevant $e/$d
    // use indices to find relevant $f
};

return MMScoper;
});
