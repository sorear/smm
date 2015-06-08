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

function __array(set) { var a=[]; set.forEach(function(v) { a.push(v); }); return a; }

MMVerifyStandard.prototype.verify = function (segix) {
    var frame = this.scoper.getFrame(segix);
    var seg = this.db.segments[segix];
    var proof = seg.proof;
    var i, mathStack = [], typeStack = [], varStack = [], depth = 0;
    var abr = new ABRStringStore();
    var incomplete = false;
    var varSyms = this.scoper.varSyms;
    var that=this, errors = [];
    var mathSave = [], typeSave = [], varSave = [];

    if (frame.errors.length) return frame.errors;

    // note that, while set.mm has 400 vars, the _vast_ majority of proofs use fewer than 32 of them, so an opportunistic bitfield version would probably be a huge win

    var aframes = new Map();

    function check(i, label) {
        var sym, aseg, oframe;
        if (label === '?') return;

        sym = that.scoper.getSym(label);

        if (!sym || sym.labelled < 0) {
            return errors = [that.proofError(seg,i,'no-such-assertion')];
        }

        aseg = that.db.segments[sym.labelled];
        oframe = that.scoper.getFrame(sym.labelled);
        if (oframe.errors.length) return errors = oframe.errors;

        if (!oframe.hasFrame) {
            if (sym.labelled >= segix || that.scoper.ends_ary[sym.labelled] < segix)
                return errors = [that.proofError(seg,i,'inactive-hyp')];
        }
        else {
            if (sym.labelled >= segix)
                return errors = [that.proofError(seg,i,'not-yet-proved')];
        }

        aframes.set(label, oframe);
    }

    function save() {
        mathSave.push(mathStack[depth-1]);
        varSave.push(varStack[depth-1]);
        typeSave.push(typeStack[depth-1]);
    }

    function recall(i) {
        if (i >= mathSave.length)
            return errors = [that.proofError(seg,-1,'recall-out-of-range')];
        //console.log(`before recall ${i}:`,typeStack.slice(0,depth).map(function (t,ix) { return `[${t}@${__array(varStack[ix]).join('+')}@ ${abr.toArray(mathStack[ix],null,20).join(' ')}]`; }).join(' '));
        mathStack[depth] = mathSave[i];
        varStack[depth] = varSave[i];
        typeStack[depth] = typeSave[i];
        depth++;
    }

    function step(i, label) {
        var oframe, j, subst, substVars, mand;
        function getVars(math) {
            return new Set(math.filter(function (m) { return varSyms.has(m); }));
        }

        function substify(math) {
            var out = abr.emptyString;
            for (var k = 0; k < math.length; k++) {
                if (subst.has(math[k])) {
                    out = abr.concat(out, subst.get(math[k]));
                }
                else {
                    out = abr.concat(out, abr.singleton(math[k]));
                }
            }
            return out;
        }

        function substifyVars(math) {
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
        }

        //console.log(`before step ${i} (${label}):`,typeStack.slice(0,depth).map(function (t,ix) { return `[${t}@${__array(varStack[ix]).join('+')}@ ${abr.toArray(mathStack[ix],null,20).join(' ')}]`; }).join(' '));
        if (label === '?') {
            typeStack[depth] = varStack[depth] = mathStack[depth] = null;
            depth++;
            incomplete = true;
            return;
        }

        oframe = aframes.get(label);

        if (!oframe.hasFrame) {
            typeStack[depth] = oframe.ttype;
            mathStack[depth] = abr.fromArray(oframe.target);
            varStack[depth] = getVars(oframe.target); //Extract variables from this
            depth++;
        }
        else {
            if (oframe.mand.length > depth)
                return errors = [that.proofError(seg,i,'stack-underflow')];

            depth -= oframe.mand.length;

            subst = new Map();
            substVars = new Map();
            // build a subsitution using the $f statements
            for (j = 0; j < oframe.mand.length; j++) {
                mand = oframe.mand[j];
                if (mand.float) {
                    // missing subst info, can't make much progress
                    if (!typeStack[depth + j]) {
                        typeStack[depth] = mathStack[depth] = varStack[depth] = null;
                        depth++;
                        return;
                    }

                    if (mand.type !== typeStack[depth + j]) {
                        return errors = [that.proofError(seg,i,'type-mismatch')];
                    }

                    subst.set(mand.variable, mathStack[depth + j]);
                    substVars.set(mand.variable, varStack[depth + j]);
                }
            }

            // check logical hyps, if provided
            for (j = 0; j < oframe.mand.length; j++) {
                mand = oframe.mand[j];
                if (mand.logic && typeStack[depth + j]) {
                    if (mand.type !== typeStack[depth + j]) {
                        return errors = [that.proofError(seg,i,'type-mismatch')];
                    }
                    if (!abr.equal(substify(mand.goal), mathStack[depth + j])) {
                        return errors = [that.proofError(seg,i,'math-mismatch')];
                    }
                }
            }

            // check DVs
            for (j = 0; j < oframe.mandDv.length; j += 2) {
                substVars.get(oframe.mandDv[j]).forEach(function (v1) {
                    var dv1 = frame.dv.get(v1);
                    substVars.get(oframe.mandDv[j+1]).forEach(function (v2) {
                        if (!dv1 || !dv1.has(v2)) {
                            errors.push(that.proofError(seg, i, 'dv-violation'));
                        }
                    });
                });
            }
            if (errors.length) return errors;

            typeStack[depth] = oframe.ttype;
            mathStack[depth] = substify(oframe.target);
            varStack[depth] = substifyVars(oframe.target);
            depth++;
        }
    }

    if (seg.type !== mmom.Segment.PROVABLE) throw new Error('verify called on not-$p');

    // the proof syntax is not self-synchronizing, so for the most part it doesn't make sense to continue

    if (proof.length && proof[0] === '(') {

        var i = 0, k = 0, ch, preload=[], can_save=false;
        for (i = 0; i < frame.mand.length; i++) {
            preload.push(this.db.segments[frame.mand[i].stmt].label);
            if (check(-1, preload[preload.length-1])) return errors;
        }

        for (i = 1; ; i++) {
            if (i >= proof.length) return [this.proofError(seg,-1,'compression-nonterm')];
            if (proof[i] === ')') break;
            if (proof[i] === '?') return [this.proofError(seg,i,'compression-dummy-in-roster')];
            if (aframes.has(proof[i])) return [this.proofError(seg,i,'compression-redundant-roster')];
            preload.push(proof[i]);
            if (check(i, proof[i])) return errors;
        }

        var text = proof.slice(i+1).join('');

        i = 0;
        while (i < text.length) {
            ch = text.charCodeAt(i++);
            if (ch >= 65 && ch <= 84) {
                k = (k * 20) + (ch - 0x41);
                if (k >= preload.length) {
                    if (recall(k - preload.length)) return errors;
                }
                else {
                    if (step(-1,preload[k])) return errors;
                }
                can_save = true;
                k = 0;
            }
            else if (ch >= 85 && ch <= 89) {
                k = (k * 5) + (ch - 84);
            }
            else if (ch === 90) {
                if (!can_save) return [this.proofError(seg,-1,'compressed-cant-save-here')];
                save();
                can_save = false;
            }
            else if (ch === 63) {
                step(-1,'?');
                can_save = false;
            }
            else {
                return [this.proofError(seg,-1,'bad-compressed-char')];
            }
        }
        if (k) return [this.proofError(seg,-1,'compressed-partial-integer')];
    }
    else {
        for (i = 0; i < proof.length; i++) {
            if (check(i, proof[i])) return errors;
            if (step(i, proof[i])) return errors;
        }
    }

    if (depth !== 1) {
        return [this.proofError(seg,-1,'done-bad-stack-depth')];
    }

    if (typeStack[0]) {
        if (!seg.math.length || typeStack[0] !== seg.math[0]) {
            return [this.proofError(seg,-1,'done-bad-type')];
        }

        if (!abr.equal(mathStack[0], abr.fromArray(seg.math.slice(1)))) {
            return [this.proofError(seg,-1,'done-bad-math')];
        }
    }

    if (incomplete) {
        return [this.proofError(seg,-1,'done-incomplete')]; // put this at the end so we can recognize "the proof is fine, so far as it exists"
    }

    return [];
};

return MMVerifyStandard;
});
