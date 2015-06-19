// This module collects information to perform name resolution and (extended) frame construction for statements
import { MMOMDatabase, MMOMError, MMOMStatement, MMOMErrorLocation as EL } from './MMOM';

var EMPTY_MAP = new Map();

// pre-optimize a math string for 'substify' (non-ABR mode only)
function cook_substify(mandVarsMap, math) {
    var work = '';
    var out = [];
    for (var i = 1; i < math.length; i++) {
        if (mandVarsMap.has(math[i])) {
            out.push(work);
            out.push(mandVarsMap.get(math[i]));
            work = '';
        }
        else {
            work = work + math[i] + ' ';
        }
    }
    out.push(work);
    return out;
}

function cook_substify_vars(mandVarsMap, math) {
    var used = new Set();
    var out = [];
    for (var i = 1; i < math.length; i++) {
        if (mandVarsMap.has(math[i]) && !used.has(math[i])) {
            used.add(math[i]);
            out.push(mandVarsMap.get(math[i]));
        }
    }
    return out;
}

// track for:
// math symbols: relevant $c/$v/$f list
// labels: pointer to definition ($e/$f/$a/$p)
// $a/$p: pink number, frame-building info ($e chain, $d chain)
// $e: $e chain, active range
// $f: active range
// $d: $d chain

var PROVABLE = MMOMStatement.PROVABLE;
var AXIOM = MMOMStatement.AXIOM;
var OPEN = MMOMStatement.OPEN;
var CLOSE = MMOMStatement.CLOSE;
var VARIABLE = MMOMStatement.VARIABLE;
var CONSTANT = MMOMStatement.CONSTANT;
var ESSENTIAL = MMOMStatement.ESSENTIAL;
var FLOATING = MMOMStatement.FLOATING;
var DISJOINT = MMOMStatement.DISJOINT;

class SymbolRecord {
    constructor(scoper) {
        this.scoper = scoper;
        this.labelled = null;
        this.math = [];
        this.mathix = [];
        this.float = [];
        this.checkGen = -1;
    }
}

class MMFrame {
    constructor(scoper, ix) {
        var statements = scoper.db.statements;
        var seg = statements[ix];
        var math;
        var essen_ix = [];
        var dv_ix = [];
        var i, j, k, l, tok, sym;

        this.mand = [];
        this.mandDv = [];
        this.dv = new Map();
        this.mandVars = [];
        this.errors = [];
        this.target = seg.math.slice(1);
        this.ttype = seg.math[0];
        this.hasFrame = true; // if false, only mandVars, target, ttype are valid
        this.ix = ix;

        var mandVarsMap = this.mandVarsMap = new Map();

        // errors should only happen here if there were errors during scan(), but you went to verify a proof anyway
        if (!seg.math.length)
            this.errors.push(EL.statement(seg).error('frame-builder', 'empty-math', { ref: EL.statement(seg) }));

        for (k = 1; k < seg.math.length; k++) {
            tok = seg.math[k];
            if (scoper.varSyms.has(tok) && !mandVarsMap.has(tok)) {
                mandVarsMap.set(tok, this.mandVars.length);
                this.mandVars.push(tok);
            }
        }

        if (seg.type !== AXIOM && seg.type !== PROVABLE) {
            this.hasFrame = false;
        }

        this.target_v = cook_substify_vars(mandVarsMap, seg.math);
        this.target_s = cook_substify(this.hasFrame ? mandVarsMap : EMPTY_MAP, seg.math); // variables are never substituted in a hypothesis

        if (!this.hasFrame) return;

        for (j = scoper.chains_ary[ix]; j >= 0; j = scoper.chains_ary[j]) {
            if (statements[j].type === ESSENTIAL) {
                essen_ix.push(j);
                if (!statements[j].math.length) {
                    this.errors.push(EL.statement(seg).error('frame-builder', 'empty-hyp', { hyp: EL.statement(statements[j]), ref: EL.statement(seg) }));
                    continue;
                }
                // capture mandatory variables
                for (k = 1; k < statements[j].math.length; k++) {
                    tok = statements[j].math[k];
                    if (scoper.varSyms.has(tok) && !mandVarsMap.has(tok)) {
                        mandVarsMap.set(tok, this.mandVars.length);
                        this.mandVars.push(tok);
                    }
                }
                this.mand.push({ float: false, type: statements[j].math[0], ix: 0, goal: statements[j].math.slice(1), goal_s: cook_substify(mandVarsMap, statements[j].math), stmt: j });
            }
            else {
                dv_ix.push(j);
            }
        }

        for (i = 0; i < this.mandVars.length; i++) {
            tok = this.mandVars[i];
            sym = scoper._getSym(tok);

            if (!sym || !sym.float.length) {
                this.errors.push(EL.statement(seg).error('frame-builder', 'no-float', { 'var': tok, ref: EL.statement(seg) }));
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

            if (statements[j].type !== FLOATING || j >= ix || ix >= scoper.ends_ary[j]) {
                this.errors.push(EL.statement(seg).error('frame-builder', 'inactive-float', { 'var': tok, ref: EL.statement(seg) }));
                continue;
            }
            if (!statements[j].math.length) {
                throw "can't happen";
            }

            this.mand.push({ float: true, type: statements[j].math[0], ix: i, goal: null, goal_s: null, stmt: j });
        }

        this.mand.sort(function (a,b) { return a.stmt - b.stmt; });

        for (j = 0; j < dv_ix.length; j++) {
            math = statements[dv_ix[j]].math;

            for (k = 0; k < math.length; k++) {
                if (!this.dv.has(math[k])) this.dv.set(math[k], new Set());
            }

            for (k = 0; k < math.length; k++) {
                for (l = 0; l < math.length; l++) {
                    if (math[k] > math[l] && !this.dv.get(math[k]).has(math[l])) {
                        this.dv.get(math[k]).add(math[l]);
                        this.dv.get(math[l]).add(math[k]);
                        if (mandVarsMap.has(math[k]) && mandVarsMap.has(math[l])) {
                            this.mandDv.push(mandVarsMap.get(math[k]), mandVarsMap.get(math[l]));
                        }
                    }
                }
            }
        }

        // mand[{float,logic,type,variable,goal}]
        // mandDv
        // dv
    }
}

function ELsym(statements, sym, ix) { return EL.math(statements[sym.math[ix]], sym.mathix[ix]); }

class MMScoper {
    constructor(db) {
        this.db = db;
        this.ends_ary = null;
        this.chains_ary = null;
        this._errors = null;
        this.symtab = null;
        this.varSyms = null;
        this._dirty = true;
    }

    _addError(loc,code,data) {
        var l1 = this._errors.get(loc.statement);
        if (!l1) {
            this._errors.set(loc.statement, l1 = []);
        }
        l1.push(loc.error('scope', code, data));
    }

    // note, even with invalid input we do not allow the symbol table to contain overlapping active ranges for $v/$f.  so it is only necessary to check the last math entry
    _getSym(label) {
        var symtab = this.symtab, r;
        return symtab.get(label) || (symtab.set(label, r = new SymbolRecord(this)), r);
    }

    lookup(sym) {
        if (this._dirty) this._scan();
        return this.symtab.get(sym);
    }

    _labelCheck(segix) {
        // error if label already used
        // error if label exists as a math symbol
        // record label
        var segtab = this.db.statements;
        var sym = this._getSym(segtab[segix].label);
        if (sym.labelled) {
            this._addError(EL.label(segtab[segix]), 'label-used-twice', { prev: EL.label(sym.labelled) });
            return;
        }

        if (sym.math.length) {
            this._addError(EL.label(segtab[segix]), 'math-then-label', { prev: ELsym(segtab,sym,0) });
        }

        sym.labelled = segtab[segix];
    }

    _mathCheck(segix) {
        // EAP math string check (all tokens active, first constant, active $f for each variable)

        var segtab = this.db.statements;
        var seg = segtab[segix];
        var ends_ary = this.ends_ary;
        var i, sym;

        if (seg.math.length === 0) {
            this._addError(EL.statement(seg), 'eap-empty');
            return;
        }

        for (i = 0; i < seg.math.length; i++) {
            sym = this._getSym(seg.math[i]);
            if (sym.checkGen === segix) continue;
            sym.checkGen = segix;

            if (!sym.math.length || ends_ary[sym.math[sym.math.length - 1]] !== HIGHSEG) {
                this._addError(EL.math(seg, i), 'eap-not-active-sym');
                continue;
            }

            if (segtab[sym.math[sym.math.length - 1]].type === VARIABLE) {
                if (i === 0) {
                    this._addError(EL.math(seg, i), 'eap-first-not-const');
                    // can only get away with this impurity because it's first
                }

                if (!sym.float.length || ends_ary[sym.float[sym.float.length - 1]] !== HIGHSEG) {
                    this._addError(EL.math(seg, i), 'eap-no-active-float');
                }
            }
        }
    }

    statementScopeEnd(stmt) {
        return this.ends_ary[stmt.index];
    }

    _update() {
        if (this._dirty) this._scan();
    }

    _scan() {
        var segix, statements = this.db.statements, seg;
        var open_vf_stack = []; // includes a -1 sentinel for each open scope
        var open_ed_ptr = -1;
        var scope_ed_stack = [];
        var open_stack = [];
        var i, j;
        this._errors = new Map();
        var ends_ary = this.ends_ary = new Int32Array(statements.length); // efcv (always HIGHSEG for c)
        var chains_ary = this.chains_ary = new Int32Array(statements.length); // edap
        this.symtab = new Map();
        this.varSyms = new Set();
        var used;
        var sym;

        for (segix = 0; segix < statements.length; segix++) {
            seg = statements[segix];

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
                        this._addError(EL.statement(seg), 'close-stack-empty');
                    }
                    break;

                case CONSTANT:
                    if (seg.math.length === 0)
                        this._addError(EL.statement(seg), 'const-empty');
                    if (scope_ed_stack.length)
                        this._addError(EL.statement(seg), 'const-not-top-scope');
                    ends_ary[segix] = HIGHSEG;
                    // error if not top scope
                    for (i = 0; i < seg.math.length; i++) {
                        sym = this._getSym(seg.math[i]);
                        if (sym.labelled) {
                            this._addError(EL.math(seg, i), 'label-then-const', { prev: EL.label(sym.labelled) });
                        }

                        if (sym.math.length) {
                            this._addError(EL.math(seg, i), 'math-then-const', { prev: ELsym(statements, sym, 0) });
                            // error if already used, and DON'T add to symbol table
                        }
                        else {
                            // add math token
                            sym.math.push(segix);
                            sym.mathix.push(i);
                        }
                    }
                    break;

                case VARIABLE:
                    if (seg.math.length === 0)
                        this._addError(EL.statement(seg), 'var-empty');
                    ends_ary[segix] = HIGHSEG;
                    for (i = 0; i < seg.math.length; i++) {
                        sym = this._getSym(seg.math[i]);
                        if (sym.labelled) {
                            this._addError(EL.math(seg, i), 'label-then-var', { prev: EL.label(sym.labelled) });
                        }

                        if (sym.math.length && ends_ary[sym.math[sym.math.length - 1]] === HIGHSEG) {
                            // still active
                            this._addError(EL.math(seg, i), 'math-then-var', { prev: ELsym(statements, sym, sym.math.length - 1) });
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

                case ESSENTIAL:
                    this._labelCheck(segix);
                    this._mathCheck(segix);
                    chains_ary[segix] = open_ed_ptr;
                    ends_ary[segix] = HIGHSEG;
                    open_vf_stack.push(segix);
                    open_ed_ptr = segix;
                    break;

                case FLOATING:
                    this._labelCheck(segix);
                    open_vf_stack.push(segix);
                    ends_ary[segix] = HIGHSEG;
                    if (seg.math.length !== 2) {
                        this._addError(EL.statement(seg), 'float-format');
                        break;
                    }
                    sym = this._getSym(seg.math[0]);
                    if (!sym.math.length || ends_ary[sym.math[sym.math.length - 1]] !== HIGHSEG || statements[sym.math[sym.math.length - 1]].type !== CONSTANT) {
                        this._addError(EL.math(seg, 0), 'float-not-active-const');
                        break;
                    }
                    sym = this._getSym(seg.math[1]);
                    if (!sym.math.length || ends_ary[sym.math[sym.math.length - 1]] !== HIGHSEG || statements[sym.math[sym.math.length - 1]].type !== VARIABLE) {
                        this._addError(EL.math(seg, 1), 'float-not-active-var');
                        break;
                    }
                    if (sym.float.length && ends_ary[sym.float[sym.float.length - 1]] === HIGHSEG) {
                        this._addError(EL.math(seg, 1), 'float-active-float', { prev: EL.statement(statements[sym.float[sym.float.length - 1]]) });
                        break;
                    }
                    sym.float.push(segix);
                    break;

                case DISJOINT:
                    if (seg.math.length < 2) {
                        this._addError(EL.statement(seg), 'dv-short');
                        break;
                    }
                    used = new Map();
                    for (var i = 0; i < seg.math.length; i++) {
                        if (used.has(seg.math[i])) {
                            this._addError(EL.math(seg, i), 'dv-repeated', { prev: EL.math(seg, used.get(seg.math[i])) });
                            continue;
                        }
                        used.set(seg.math[i],i);
                        sym = this._getSym(seg.math[i]);
                        if (sym.math.length && statements[sym.math[sym.math.length - 1]].type === VARIABLE && ends_ary[sym.math[sym.math.length - 1]] === HIGHSEG) {
                            // active $v
                        }
                        else {
                            this._addError(EL.math(seg, i), 'dv-not-active-var');
                        }
                    }
                    // add to e/d chain
                    chains_ary[segix] = open_ed_ptr;
                    open_ed_ptr = segix;
                    break;

                case AXIOM:
                case PROVABLE:
                    this._labelCheck(segix);
                    this._mathCheck(segix);
                    chains_ary[segix] = open_ed_ptr;
                    ends_ary[segix] = HIGHSEG;
                    break;
            }
        }

        // error if scope stack not empty
        for (i = 0; i < open_stack.length; i++) {
            this._addError(EL.statement(open_stack[i]), 'never-closed');
        }

        this._dirty = false;
    }

    getFrame(ix) { return new MMFrame(this, ix); }

    get allErrors() {
        if (this._dirty) this._scan();
        return this._errors;
    }

    errors(stmt) {
        if (!(stmt instanceof MMOMStatement) || stmt.database !== this.db) throw new TypeError('bad statement');
        if (this._dirty) this._scan();
        return this._errors.get(stmt) || [];
    }
}

var HIGHSEG = MMScoper.HIGHSEG = -1 >>> 1;
// MM files larger than 2GB are likely to cause no end of problems...

MMOMDatabase.registerAnalyzer('scoper', MMScoper);

MMOMError.register('scope', 'label-used-twice', 'A label may only be defined once«prev:Previous definition:l»');
MMOMError.register('scope', 'math-then-label', 'A label may not be defined which is the same as a defined math token«prev:Previous definition:l»');
MMOMError.register('scope', 'eap-empty', 'Math string for $e/$a/$p statement may not be empty');
MMOMError.register('scope', 'eap-not-active-sym', 'Symbol referenced in the math string of an $e/$a/$p statement must have an active definition');
MMOMError.register('scope', 'eap-first-not-const', 'First symbol of an $e/$a/$p statement math string must be a constant');
MMOMError.register('scope', 'eap-no-active-float', 'When a variable symbol is referenced in an $e/$a/$p statement math string, there must be an active $f in scope for that variable');
MMOMError.register('scope', 'close-stack-empty', 'There must be an open ${ before it can be closed with $}');
MMOMError.register('scope', 'const-empty', 'A $c statement must declare at least one constant');
MMOMError.register('scope', 'const-not-top-scope', 'A $c statement is only allowed outside all ${ $} scopes');
MMOMError.register('scope', 'label-then-const', 'A math symbol may not be declared when already used as a label«prev:Previous definition:l»');
MMOMError.register('scope', 'math-then-const', 'A math symbol may not be redeclared as a constant«prev:Previous definition:l»');
MMOMError.register('scope', 'var-empty', 'A $v statement must declare at least one variable');
MMOMError.register('scope', 'label-then-var', 'A math symbol may not be declared when already used as a label«prev:Previous definition:l»');
MMOMError.register('scope', 'math-then-var', 'This variable may not be redeclared as it is already active in this scope«prev:Previous definition:l»');
MMOMError.register('scope', 'float-format', 'A $f statement must have exactly two math symbols (a constant and a variable)');
MMOMError.register('scope', 'float-not-active-const', 'The first symbol of an $f statement must be an active constant');
MMOMError.register('scope', 'float-not-active-var', 'The second symbol of an $f statement must be an active variable');
MMOMError.register('scope', 'float-active-float', 'There is already a $f statement active in this scope for this variable, so another may not be declared«prev:Previous definition:l»');
MMOMError.register('scope', 'dv-short', 'A $d constraint must mention at least two variables');
MMOMError.register('scope', 'dv-repeated', 'A $d constraint may not mention the same variable more than once«prev:Previous mention:l»');
MMOMError.register('scope', 'dv-not-active-var', 'Each symbol appearing in a $d statement must name an active variable');
MMOMError.register('scope', 'never-closed', 'A ${ statement must be closed by a later $}');

// these are necessarily secondary errors, hence slight weirdness
MMOMError.register('frame-builder', 'empty-math', 'Frame building failed: lacking a math string«ref:Assertion referenced:l»');
MMOMError.register('frame-builder', 'empty-hyp', 'Frame building failed: having a mandatory $e hypothesis with no math string«ref:Assertion referenced:l»«hyp:Bad hypothesis:l»');
MMOMError.register('frame-builder', 'no-float', 'Frame building failed: having a mandatory variable «var:m» while no $f exists for that variable in the database«ref:Assertion referenced:l»');
MMOMError.register('frame-builder', 'inactive-float', 'Frame building failed: having a mandatory variable «var:m» but no $f statements for that are active«ref:Assertion referenced:l»');
