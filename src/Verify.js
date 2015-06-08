if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(['./MMOM','./ABRStringStore','./Scoper'], function (mmom,ABRStringStore,Scoper) {
'use strict';

function MMVerifyStandard(db) {
    this.db = db;
    this.scoper = Scoper.install(db);
}

MMVerifyStandard.install = function (db) {
    return db.plugins.verify || (db.plugins.verify = new MMVerifyStandard(db));
};

MMVerifyStandard.prototype.proofError = function (seg, i, code, data) {
    if (i < 0) return new mmom.Error(seg.startPos[0], seg.startPos[1], 'verify', code, data);
    return new mmom.Error(seg.proofPos[2*i+0], seg.proofPos[2*i+1], 'verify', code, data);
};

function __array(set) { var a=[]; set.forEach(function(v) { a.push(v); }); return a; } // Array.of

function MMVerifyState(verify, segix, use_abr) {
    this.scoper = verify.scoper;
    this.verify = verify;
    this.segments = verify.db.segments;
    this.frame = this.scoper.getFrame(segix);
    this.seg = this.segments[segix];
    this.segix = segix;
    this.errors = [];
    this.aframes = new Map();
    this.mathStack = [];
    this.mathSave = [];
    this.varStack = [];
    this.varSave = [];
    this.typeStack = [];
    this.typeSave = [];
    this.depth = 0;
    this.incomplete = false;
    this.varSyms = this.scoper.varSyms;
    this.use_abr = use_abr;
    this.abr = use_abr ? new ABRStringStore() : null;
    Object.seal(this);
}

MMVerifyState.prototype.check = function (i, label) {
    var sym, aseg, oframe;
    if (label === '?') return;

    sym = this.scoper.getSym(label);

    if (!sym || sym.labelled < 0) {
        return this.errors = [this.proofError(i,'no-such-assertion')];
    }

    aseg = this.segments[sym.labelled];
    oframe = this.scoper.getFrame(sym.labelled);
    if (oframe.errors.length) return this.errors = oframe.errors;

    if (!oframe.hasFrame) {
        if (sym.labelled >= this.segix || this.scoper.ends_ary[sym.labelled] < this.segix)
            return this.errors = [this.proofError(i,'inactive-hyp')];
    }
    else {
        if (sym.labelled >= this.segix)
            return this.errors = [this.proofError(i,'not-yet-proved')];
    }

    this.aframes.set(label, oframe);
};

MMVerifyState.prototype.save = function () {
    this.mathSave.push(this.mathStack[this.depth-1]);
    this.varSave.push(this.varStack[this.depth-1]);
    this.typeSave.push(this.typeStack[this.depth-1]);
};

MMVerifyState.prototype.recall = function (i) {
    if (i >= this.mathSave.length)
        return this.errors = [this.proofError(this.seg,-1,'recall-out-of-range')];
    //console.log(`before recall ${i}:`,typeStack.slice(0,depth).map(function (t,ix) { return `[${t}@${__array(varStack[ix]).join('+')}@ ${abr.toArray(mathStack[ix],null,20).join(' ')}]`; }).join(' '));
    this.mathStack[this.depth] = this.mathSave[i];
    this.varStack[this.depth] = this.varSave[i];
    this.typeStack[this.depth] = this.typeSave[i];
    this.depth++;
};

MMVerifyState.prototype.getVars = function (math) {
    var that = this;
    return new Set(math.filter(function (m) { return that.varSyms.has(m); }));
};

var FAST_BAILOUT = new Error();

MMVerifyState.prototype.substify = function (subst, math) {
    var out = this.use_abr ? this.abr.emptyString : '';
    for (var k = 0; k < math.length; k++) {
        if (subst.has(math[k])) {
            out = this.use_abr ? this.abr.concat(out, subst.get(math[k])) : out + subst.get(math[k]);
        }
        else {
            out = this.use_abr ? this.abr.concat(out, this.abr.singleton(math[k])) : out + math[k] + ' ';
        }
        if (!this.use_abr && out.length > 1000000) throw FAST_BAILOUT;
    }
    return out;
};

// note that, while set.mm has 400 vars, the _vast_ majority of proofs use fewer than 32 of them, so an opportunistic bitfield version would probably be a huge win
MMVerifyState.prototype.substifyVars = function (substVars, math) {
    var out = new Set();
    var done = new Set();
    var k;
    for (k = 0; k < math.length; k++) {
        if (substVars.has(math[k]) && !done.has(math[k])) {
            substVars.get(math[k]).forEach(function (mm) { out.add(mm); });
            done.add(math[k]);
        }
    }
    return out;
};

MMVerifyState.prototype.step = function (i, label) {
    var oframe, j, subst, substVars, mand;

    //console.log(`before step ${i} (${label}):`,typeStack.slice(0,this.depth).map(function (t,ix) { return `[${t}@${__array(varStack[ix]).join('+')}@ ${abr.toArray(mathStack[ix],null,20).join(' ')}]`; }).join(' '));
    if (label === '?') {
        this.typeStack[this.depth] = this.varStack[this.depth] = this.mathStack[this.depth] = null;
        this.depth++;
        this.incomplete = true;
        return;
    }

    oframe = this.aframes.get(label);

    if (!oframe.hasFrame) {
        this.typeStack[this.depth] = oframe.ttype;
        this.mathStack[this.depth] = this.use_abr ? this.abr.fromArray(oframe.target) : oframe.target.map(function (x) { return x + ' '; }).join('');
        this.varStack[this.depth] = this.getVars(oframe.target); //Extract variables from this
        this.depth++;
    }
    else {
        if (oframe.mand.length > this.depth)
            return this.errors = [this.proofError(i,'stack-underflow')];

        this.depth -= oframe.mand.length;

        subst = new Map();
        substVars = new Map();
        // build a subsitution using the $f statements
        for (j = 0; j < oframe.mand.length; j++) {
            mand = oframe.mand[j];
            if (mand.float) {
                // missing subst info, can't make much progress
                if (!this.typeStack[this.depth + j]) {
                    this.typeStack[this.depth] = this.mathStack[this.depth] = this.varStack[this.depth] = null;
                    this.depth++;
                    return;
                }

                if (mand.type !== this.typeStack[this.depth + j]) {
                    return this.errors = [this.proofError(i,'type-mismatch')];
                }

                subst.set(mand.variable, this.mathStack[this.depth + j]);
                substVars.set(mand.variable, this.varStack[this.depth + j]);
            }
        }

        // check logical hyps, if provided
        for (j = 0; j < oframe.mand.length; j++) {
            mand = oframe.mand[j];
            if (mand.logic && this.typeStack[this.depth + j]) {
                if (mand.type !== this.typeStack[this.depth + j]) {
                    return this.errors = [this.proofError(i,'type-mismatch')];
                }
                if (this.substify(subst, mand.goal) !== this.mathStack[this.depth + j]) {
                    return this.errors = [this.proofError(i,'math-mismatch')];
                }
            }
        }

        // check DVs
        var that = this;
        for (j = 0; j < oframe.mandDv.length; j += 2) {
            substVars.get(oframe.mandDv[j]).forEach(function (v1) {
                var dv1 = that.frame.dv.get(v1);
                substVars.get(oframe.mandDv[j+1]).forEach(function (v2) {
                    if (!dv1 || !dv1.has(v2)) {
                        that.errors.push(that.proofError(i, 'dv-violation'));
                    }
                });
            });
        }
        if (this.errors.length) return this.errors;

        this.typeStack[this.depth] = oframe.ttype;
        this.mathStack[this.depth] = this.substify(subst, oframe.target);
        this.varStack[this.depth] = this.substifyVars(substVars, oframe.target);
        this.depth++;
    }
};

MMVerifyState.prototype.proofError = function (i, code) {
    return this.verify.proofError(this.seg, i, code);
};

MMVerifyState.prototype.checkProof = function () {
    var proof = this.seg.proof;
    if (this.seg.type !== mmom.Segment.PROVABLE) throw new Error('verify called on not-$p');

    var frame = this.frame;
    if (frame.errors.length) return frame.errors;

    // the proof syntax is not self-synchronizing, so for the most part it doesn't make sense to continue
    if (proof.length && proof[0] === '(') {

        var i = 0, k = 0, ch, preload=[], can_save=false;
        for (i = 0; i < frame.mand.length; i++) {
            preload.push(this.segments[frame.mand[i].stmt].label);
            if (this.check(-1, preload[preload.length-1])) return this.errors;
        }

        for (i = 1; ; i++) {
            if (i >= proof.length) return [this.proofError(-1,'compression-nonterm')];
            if (proof[i] === ')') break;
            if (proof[i] === '?') return [this.proofError(i,'compression-dummy-in-roster')];
            if (this.aframes.has(proof[i])) return [this.proofError(i,'compression-redundant-roster')];
            preload.push(proof[i]);
            if (this.check(i, proof[i])) return this.errors;
        }

        var text = proof.slice(i+1).join('');

        i = 0;
        while (i < text.length) {
            ch = text.charCodeAt(i++);
            if (ch >= 65 && ch <= 84) {
                k = (k * 20) + (ch - 0x41);
                if (k >= preload.length) {
                    if (this.recall(k - preload.length)) return errors;
                }
                else {
                    if (this.step(-1,preload[k])) return errors;
                }
                can_save = true;
                k = 0;
            }
            else if (ch >= 85 && ch <= 89) {
                k = (k * 5) + (ch - 84);
            }
            else if (ch === 90) {
                if (!can_save) return [this.proofError(-1,'compressed-cant-save-here')];
                this.save();
                can_save = false;
            }
            else if (ch === 63) {
                this.step(-1,'?');
                can_save = false;
            }
            else {
                return [this.proofError(-1,'bad-compressed-char')];
            }
        }
        if (k) return [this.proofError(-1,'compressed-partial-integer')];
    }
    else {
        for (i = 0; i < proof.length; i++) {
            if (this.check(i, proof[i])) return this.errors;
            if (this.step(i, proof[i])) return this.errors;
        }
    }

    if (this.depth !== 1) {
        return [this.proofError(-1,'done-bad-stack-depth')];
    }

    if (this.typeStack[0]) {
        if (!this.seg.math.length || this.typeStack[0] !== this.seg.math[0]) {
            return [this.proofError(-1,'done-bad-type')];
        }

        if (this.mathStack[0] !== (this.use_abr ? this.abr.fromArray(this.seg.math.slice(1)) : this.seg.math.slice(1).map(function (x) { return x + ' '; }).join(''))) {
            return [this.proofError(-1,'done-bad-math')];
        }
    }

    if (this.incomplete) {
        return [this.proofError(-1,'done-incomplete')]; // put this at the end so we can recognize "the proof is fine, so far as it exists"
    }

    return [];
};

MMVerifyStandard.prototype.verify = function (segix) {
    try {
        return (new MMVerifyState(this, segix, false)).checkProof();
    } catch (e) {
        if (e === FAST_BAILOUT) {
            return (new MMVerifyState(this, segix, true)).checkProof();
        }
        else {
            throw e;
        }
    }
};

return MMVerifyStandard;
});
