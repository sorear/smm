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

MMVerifyStandard.prototype.verify = function (segix) {
    var frame = this.scoper.getFrame(segix);
    var seg = this.db.segments[segix];
    var proof = seg.proof;
    var i, label, sym, aseg, mathStack = [], typeStack = [], varStack = [], depth = 0;
    var abr = new ABRStringStore();
    var oframe, j, subst, substVars, incomplete = false, mand;
    var varSyms = this.scoper.varSyms;
    var that=this, errors = [];

    if (frame.errors.length) return frame.errors;

    // note that, while set.mm has 400 vars, the _vast_ majority of proofs use fewer than 32 of them, so an opportunistic bitfield version would probably be a huge win

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

    if (seg.type !== mmom.Segment.PROVABLE) throw new Error('verify called on not-$p');

    if (proof.length && proof[0] === '(') {
        return [this.proofError(seg,0,'compression-nyi')]; // TODO
    }

    // the proof syntax is not self-synchronizing, so for the most part it doesn't make sense to continue
    STEP: for (i = 0; i < proof.length; i++) {
        label = proof[i];
        if (label === '?') {
            typeStack[depth] = varStack[depth] = mathStack[depth] = null;
            depth++;
            incomplete = true;
            continue;
        }

        sym = this.scoper.getSym(label);

        if (!sym || sym.labelled < 0) {
            return [this.proofError(seg,i,'no-such-assertion')];
        }

        aseg = this.db.segments[sym.labelled];
        if (!aseg.math.length) return [this.proofError(seg,i,'malformed-referent')]; //bail if corrupt

        if (aseg.type === mmom.Segment.ESSEN || aseg.type === mmom.Segment.FLOAT) {
            if (sym.labelled >= segix || this.scoper.ends_chains_ary[sym.labelled] < segix)
                return [this.proofError(seg,i,'inactive-hyp')];
            typeStack[depth] = aseg.math[0] || '$';
            mathStack[depth] = abr.fromArray(aseg.math.slice(1));
            varStack[depth] = getVars(aseg.math.slice(1)); //Extract variables from this
            depth++;
        }
        else {
            if (sym.labelled >= segix)
                return [this.proofError(seg,i,'not-yet-proved')];

            oframe = this.scoper.getFrame(sym.labelled);
            if (oframe.errors.length) return oframe.errors;

            if (oframe.mand.length > depth)
                return [this.proofError(seg,i,'stack-underflow')];

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
                        continue STEP;
                    }

                    if (mand.type !== typeStack[depth + j]) {
                        return [this.proofError(seg,i,'type-mismatch')];
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
                        return [this.proofError(seg,i,'type-mismatch')];
                    }
                    if (!abr.equal(substify(mand.goal), mathStack[depth + j])) {
                        return [this.proofError(seg,i,'math-mismatch')];
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

            typeStack[depth] = aseg.math[0];
            mathStack[depth] = substify(aseg.math.slice(1));
            varStack[depth] = substifyVars(aseg.math);
            depth++;
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
