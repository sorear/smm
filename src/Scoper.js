if (typeof define !== 'function') { var define = require('amdefine')(module) }

// This module collects information to perform name resolution and (extended) frame construction for statements

define(['./MMOM'], function (mmom) {
'use strict';

function MMScoper(db) {
    this.db = db;
    this.ends_ary = null;
    this.chains_ary = null;
    this.errors = null;
    this.symtab = null;
    this.varSyms = null;
    this.scan();
}

MMScoper.install = function (db) {
    return db.plugins.scoper || (db.plugins.scoper = new MMScoper(db));
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
    var symtab = this.symtab, r;
    return symtab.get(label) || (symtab.set(label, r = { labelled: -1, math: [], mathix: [], float: [] }), r);
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

var HIGHSEG = MMScoper.HIGHSEG = -1 >>> 1;
// MM files larger than 2GB are likely to cause no end of problems...

MMScoper.prototype.mathCheck = function (segix) {
    // EAP math string check (all tokens active, first constant, active $f for each variable)

    var segtab = this.db.segments;
    var seg = segtab[segix];
    var ends_ary = this.ends_ary;
    var i, sym, checked;

    if (seg.math.length === 0) {
        this.addError(seg.startPos, 0, 'eap-empty');
        return;
    }

    checked = new Set();
    for (i = 0; i < seg.math.length; i++) {
        if (checked.has(seg.math[i])) continue;
        checked.add(seg.math[i]);

        sym = this.getSym(seg.math[i]);

        if (!sym.math.length || ends_ary[sym.math[sym.math.length - 1]] !== HIGHSEG) {
            this.addError(seg.mathPos, i, 'eap-not-active-sym');
            continue;
        }

        if (segtab[sym.math[sym.math.length - 1]].type === VAR) {
            if (i === 0) {
                this.addError(seg.mathPos, 0, 'eap-first-not-const');
                // can only get away with this impurity because it's first
            }

            if (!sym.float.length || ends_ary[sym.float[sym.float.length - 1]] !== HIGHSEG) {
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
    var ends_ary = this.ends_ary = new Int32Array(segments.length); // efcv (always HIGHSEG for c)
    var chains_ary = this.chains_ary = new Int32Array(segments.length); // edap
    this.symtab = new Map();
    this.varSyms = new Set();
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
                        ends_ary[i] = segix;
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
                ends_ary[segix] = HIGHSEG;
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
                ends_ary[segix] = HIGHSEG;
                for (i = 0; i < seg.math.length; i++) {
                    sym = this.getSym(seg.math[i]);
                    if (sym.labelled >= 0) {
                        this.addError(seg.mathPos, i, 'label-then-var', { prev: this.getPos(segments[sym.labelled].startPos, 0) });
                    }

                    if (sym.math.length && ends_ary[sym.math[sym.math.length - 1]] === HIGHSEG) {
                        // still active
                        this.addError(seg.mathPos, i, 'math-then-var', { prev: this.getPos(segments[sym.math[sym.math.length - 1]].mathPos, sym.mathix[sym.math.length - 1]) });
                    }
                    else {
                        this.varSyms.add(seg.math[i]);
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
                chains_ary[segix] = open_ed_ptr;
                ends_ary[segix] = HIGHSEG;
                open_vf_stack.push(segix);
                open_ed_ptr = segix;
                break;

            case FLOAT:
                this.labelCheck(segix);
                open_vf_stack.push(segix);
                ends_ary[segix] = HIGHSEG;
                if (seg.math.length !== 2) {
                    this.addError(seg.startPos, 0, 'float-format');
                    break;
                }
                sym = this.getSym(seg.math[0]);
                if (!sym.math.length || ends_ary[sym.math[sym.math.length - 1]] !== HIGHSEG || segments[sym.math[sym.math.length - 1]].type !== CONST) {
                    this.addError(seg.mathPos, 0, 'float-not-active-const');
                    break;
                }
                sym = this.getSym(seg.math[1]);
                if (!sym.math.length || ends_ary[sym.math[sym.math.length - 1]] !== HIGHSEG || segments[sym.math[sym.math.length - 1]].type !== VAR) {
                    this.addError(seg.mathPos, 1, 'float-not-active-var');
                    break;
                }
                if (sym.float.length && ends_ary[sym.float[sym.float.length - 1]] === HIGHSEG) {
                    this.addError(seg.mathPos, 1, 'float-active-float', { prev: this.getPos(segments[sym.float[sym.float.length - 1]].startPos, 0) });
                    break;
                }
                sym.float.push(segix);
                break;

            case DV:
                if (seg.math.length < 2) {
                    this.addError(seg.startPos, 0, 'dv-short');
                    break;
                }
                used = new Map();
                for (var i = 0; i < seg.math.length; i++) {
                    if (used.has(seg.math[i])) {
                        this.addError(seg.mathPos, i, 'dv-repeated', { prev: this.getPos(seg.mathPos, used.get(seg.math[i])) });
                        continue;
                    }
                    used.set(seg.math[i],i);
                    sym = this.getSym(seg.math[i]);
                    if (sym.math.length && segments[sym.math[sym.math.length - 1]].type === VAR && ends_ary[sym.math[sym.math.length - 1]] === HIGHSEG) {
                        // active $v
                    }
                    else {
                        this.addError(seg.mathPos, i, 'dv-not-active-var');
                    }
                }
                // add to e/d chain
                chains_ary[segix] = open_ed_ptr;
                open_ed_ptr = segix;
                break;

            case AXIOM:
            case PROVABLE:
                this.labelCheck(segix);
                this.mathCheck(segix);
                chains_ary[segix] = open_ed_ptr;
                break;
        }
    }

    // error if scope stack not empty
    for (i = 0; i < open_stack.length; i++) {
        this.addError(open_stack[i].startPos, 0, 'never-closed');
    }
};

function MMFrame(scoper, ix) {
    var segments = scoper.db.segments;
    var seg = segments[ix];
    var math;
    var essen_ix = [];
    var dv_ix = [];
    var j, k, l, tok, sym;

    this.mand = [];
    this.mandDv = [];
    this.dv = new Map();
    this.mandVars = new Set();
    this.errors = [];
    this.target = seg.math.slice(1);
    this.ttype = seg.math[0];
    this.hasFrame = true; // if false, only mandVars, target, ttype are valid
    this.ix = ix;

    // errors should only happen here if there were errors during scan(), but you went to verify a proof anyway
    if (!seg.math.length)
        this.errors.push(new mmom.Error(seg.startPos[0], seg.startPos[1], 'frame-builder', 'empty-math'));

    for (k = 1; k < seg.math.length; k++) {
        tok = seg.math[k];
        if (scoper.varSyms.has(tok)) this.mandVars.add(tok);
    }

    if (seg.type !== AXIOM && seg.type !== PROVABLE) {
        this.hasFrame = false;
        return;
    }

    for (j = scoper.chains_ary[ix]; j >= 0; j = scoper.chains_ary[j]) {
        if (segments[j].type === ESSEN) {
            essen_ix.push(j);
            if (!segments[j].math.length) {
                this.errors.push(new mmom.Error(seg.startPos[0], seg.startPos[1], 'frame-builder', 'empty-hyp'));
                continue;
            }
            // capture mandatory variables
            for (k = 1; k < segments[j].math.length; k++) {
                tok = segments[j].math[k];
                if (scoper.varSyms.has(tok)) this.mandVars.add(tok);
            }
            this.mand.push({ float: false, logic: true, type: segments[j].math[0], variable: null, goal: segments[j].math.slice(1), stmt: j });
        }
        else {
            dv_ix.push(j);
        }
    }

    for (tok of this.mandVars) {
        sym = scoper.getSym(tok);

        if (!sym || !sym.float.length) {
            this.errors.push(new mmom.Error(seg.startPos[0], seg.startPos[1], 'frame-builder', 'no-float'));
            continue;
        }

        j = 0; k = sym.float.length;
        while (k - j > 1) {
            l = (j + k) >>> 1;
            if (ix >= sym.float[l]) {
                j = l;
            }
            else {
                k = l;
            }
        }

        j = sym.float[j];

        if (segments[j].type !== FLOAT || j >= ix || ix >= scoper.ends_ary[j]) {
            this.errors.push(new mmom.Error(seg.startPos[0], seg.startPos[1], 'frame-builder', 'inactive-float'));
            continue;
        }
        if (!segments[j].math.length) {
            throw "can't happen";
        }

        this.mand.push({ float: true, logic: false, type: segments[j].math[0], variable: segments[j].math[1], goal: null, stmt: j });
    }

    this.mand.sort(function (a,b) { return a.stmt - b.stmt; });

    for (j = 0; j < dv_ix.length; j++) {
        math = segments[dv_ix[j]].math;

        for (k = 0; k < math.length; k++) {
            if (!this.dv.has(math[k])) this.dv.set(math[k], new Set());
        }

        for (k = 0; k < math.length; k++) {
            for (l = 0; l < math.length; l++) {
                if (math[k] > math[l] && !this.dv.get(math[k]).has(math[l])) {
                    this.dv.get(math[k]).add(math[l]);
                    this.dv.get(math[l]).add(math[k]);
                    if (this.mandVars.has(math[k]) && this.mandVars.has(math[l])) {
                        this.mandDv.push(math[k], math[l]);
                    }
                }
            }
        }
    }

    // mand[{float,logic,type,variable,goal}]
    // mandDv
    // dv
}

MMScoper.prototype.getFrame = function (ix) {
    return new MMFrame(this, ix);
};

return MMScoper;
});
