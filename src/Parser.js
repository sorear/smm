if (typeof define !== 'function') { var define = require('amdefine')(module) }

define(['./MMOM','./Scoper'], function (MMOM) {
'use strict';

var EL = MMOM.ErrorLocation;

function MMOMParser(db) {
    this._db = db;
    this._dirty = true; // for the parser itself
    this._checkedAll = false;
    this._scoper = db.scoper;
    this._errors = new Map();
    this._index = [];
    this._thread = [];
    this._rules = new Map();
    this._parses = new Map();

    this._order = ['set', 'class', 'wff']; //TODO: these should be configurable
    this._roles = new Map().set('|-', 'wff');
}

MMOM.Database.registerAnalyzer('parser', MMOMParser);

MMOM.Error.register('parser', 'float-not-syntax', 'Type code of $f statement must be a syntactic type code');
MMOM.Error.register('parser', 'syntax-with-e', 'Axiom with a syntactic type code must not have $e hypotheses«hyp:Hypothesis:l»');
MMOM.Error.register('parser', 'syntax-with-dv', 'Axiom with a syntactic type code must not have mandatory disjoint variable conditions («left:m», «right:m»)');
MMOM.Error.register('parser', 'syntax-repeat-var', 'Variable may not be used more than once in a syntactic axiom«prev:Previous use:l»');
MMOM.Error.register('parser', 'syntax-ref-nonsyntax', 'Syntactic axiom may not reference non-syntactic variables');
MMOM.Error.register('parser', 'syntax-left-recursive', 'A syntax axiom may only left recurse into rules with tighter type codes');
MMOM.Error.register('parser', 'essen-syntax', 'A $e hypothesis may not use a syntactic category');
MMOM.Error.register('parser', 'unconfigured-type', 'Unconfigured type code');
MMOM.Error.register('parser', 'ambiguous', 'Grammatical ambiguity detected; from here can be parsed «one:s» or «two:s»');
MMOM.Error.register('parser', 'parse-error', 'Parsing failed here; expected any of: «expect:m»');
MMOM.Error.register('parser', 'truncated', 'Statement is incomplete; expected any of: «expect:m»');
MMOM.Error.register('parser', 'trailing-symbols', 'Unexpected symbols after statement');

MMOMParser.prototype._addError = function (loc,code,data) {
    var l1 = this._errors.get(loc.statement);
    if (!l1) {
        this._errors.set(loc.statement, l1 = []);
    }
    l1.push(loc.error('parser', code, data));
};

MMOMParser.prototype._buildParser = function () {
    this._errors = new Map();
    this._index = [];
    this._thread = [];
    this._rules = new Map();
    this._extractRules();
    this._dirty = false;
    this._checkedAll = false;
};

function FactorTree(nt_depth) {
    this.nt_depth = nt_depth;
    this.leaves = [];
    this.nonterminals = [];
    this.terminals = new Map();
}

FactorTree.prototype.addLeaf = function (stmt, limit, permute) {
    this.leaves.push({ stmt: stmt, limit: limit, permute: permute });
};

FactorTree.prototype.addTerminal = function (tok) {
    var next = this.terminals.get(tok);
    if (!next) this.terminals.set(tok, next = new FactorTree(this.nt_depth));
    return next;
};

FactorTree.prototype.addNonterminal = function (goali) {
    var next = this.nonterminals[goali];
    if (!next) this.nonterminals[goali] = next = new FactorTree(this.nt_depth+1);
    return next;
};

FactorTree.prototype.toThread = function (depth,cont) {
    if (this.terminals.size) {
        var ncase = new Map();
        this.terminals.forEach(function (v, k) {
            ncase.set(k, v.toThread(depth+1,cont));
        });
        cont = new FactorThread(depth, null, 0, null, -1, ncase, cont, null);
    }

    for (var i = this.nonterminals.length - 1; i >= 0; i--) {
        if (this.nonterminals[i])
            cont = new FactorThread(depth, null, 0, null, i, null, cont, this.nonterminals[i].toThread(depth+1,cont));
    }

    for (var i = this.leaves.length - 1; i >= 0; i--) {
        cont = new FactorThread(depth, this.leaves[i].stmt, this.leaves[i].limit, this.leaves[i].permute, -1, null, cont, null);
    }

    return cont;
};

function FactorThread(depth, statement, limit, permute, type, cases, next0, next1) {
    this.depth = depth;
    this.statement = statement;
    this.singleton = null;
    this.limit = limit;
    this.permute = permute;
    this.type = type;
    this.cases = cases;
    this.next0 = next0;
    this.next1 = next1;

    if (this.statement && !this.permute.length) {
        this.singleton = new MMOMParserNode(this.statement, []);
    }
}

MMOMParser.prototype._extractRules = function () {
    this._scoper._update(); // required for getFrame
    for (var i = 0; i < this._order.length; i++) {
        this._index[i] = new FactorTree(0);
    }

    for (var i = 0; i < this._db.statements.length; i++) {
        var stmt = this._db.statements[i];

        if (stmt.type === MMOM.Statement.FLOATING) {
            if (stmt.math.length !== 2) continue;
            var order = this._order.indexOf(stmt.math[0]);
            var bad = false;
            if (order < 0) {
                this._addError(EL.math(stmt,0), 'float-not-syntax');
                bad = true;
            }
            if (!bad) {
                var rule = {
                    stmt: stmt, arity: 0, commands: [{ lit: stmt.math[1], index: -1, type: -1 }], type: stmt.math[0], limit: this._scoper.statementScopeEnd(stmt)
                };
                this._index[order].addTerminal(stmt.math[1]).addLeaf(stmt, rule.limit, []);
                this._rules.set(stmt.index, rule);
            }
            continue;
        }
        else if (stmt.type !== MMOM.Statement.AXIOM) {
            continue;
        }

        //Rest of this is for axioms
        var order = this._order.indexOf(stmt.math[0]);
        if (order < 0) continue;

        // this is a syntaxiom
        var frame = this._scoper.getFrame(i);
        if (frame.errors.length) continue;
        var bad = false;
        var varOrder = new Map();
        var varUsed = new Map();

        for (var j = 0; j < frame.mand.length; j++) {
            if (frame.mand[j].float) {
                varOrder.set(frame.mandVars[frame.mand[j].ix],j);
            }
            else {
                this._addError(EL.statement(stmt),'syntax-with-e',{ hyp: EL.statement(this._db.statements[frame.mand[j].stmt]) });
                bad = true;
            }
        }
        if (frame.mandDv.length) {
            this._addError(EL.statement(stmt),'syntax-with-dv',{ left: frame.mandVars[frame.mandDv[0]], right: frame.mandVars[frame.mandDv[1]] });
            bad = true;
        }
        var commands = [];
        var cursor = this._index[order];
        var permute = [];
        var nnonterm=0;

        for (var j = 1; j < stmt.math.length; j++) {
            var float = varOrder.get(stmt.math[j]);
            if (float !== undefined) {
                if (varUsed.has(stmt.math[j])) {
                    this._addError(EL.math(stmt, j),'syntax-repeat-var',{ prev: EL.math(stmt, varUsed.get(stmt.math[j])) });
                    bad = true;
                }
                else {
                    varUsed.set(stmt.math[j],j);
                }

                var type = frame.mand[float].type;
                var reforder = this._order.indexOf(type);
                if (reforder < 0) {
                    this._addError(EL.math(stmt, j), 'syntax-ref-nonsyntax');
                    bad = true;
                }
                else if (j === 1 && reforder >= order) {
                    this._addError(EL.math(stmt, j), 'syntax-left-recursive');
                    bad = true;
                }

                commands.push({ lit: stmt.math[j], index: float, type: reforder });
                permute[float] = j-1;
                cursor = cursor.addNonterminal(reforder);
            }
            else {
                commands.push({ lit: stmt.math[j], index: -1, type: -1 });
                cursor = cursor.addTerminal(stmt.math[j]);
            }
        }

        if (!bad) {
            var rule = {
                stmt: stmt, arity: frame.mand.length, commands: commands, type: stmt.math[0], limit: this._scoper.statementScopeEnd(stmt)
            };
            cursor.addLeaf(stmt, rule.limit, permute);
            this._rules.set(stmt.index, rule);
        }
    }

    for (var i = 0; i < this._order.length; i++) {
        this._thread[i] = this._index[i].toThread(0, null);
    }
};

function MMOMParserNode(syntax_axiom, children) {
    this.syntax_axiom = syntax_axiom;
    this.children = children;
}
MMOMParserNode.prototype.dump = function () { return this.syntax_axiom.label + '(' + this.children.map(function (x) { return x.dump(); }).join(',') + ')'; };
MMOMParser.Node = MMOMParserNode;

MMOMParser.prototype._packratStep = function (ctx, type, ix) {
    var memo = ctx.memo[type];
    if (memo[ix]) return memo[ix];
    if (ctx.highwater === ix) { ctx.highwater_list.push(this._order[type]); }

    var ip = this._thread[type];
    var ixes = [];
    ixes[0] = ix;
    var rres = { end: 0, tree: null };
    var child_buffer = [];

    while (ip) {
        var anix = ixes[ip.depth];
        if (ip.cases) {
            if (ctx.highwater === anix) {
                if (anix !== ix) ip.cases.forEach(function (v,k) { ctx.highwater_list.push(k); });
                if (anix < ctx.math.length) {
                    var nip = ip.cases.get(ctx.math[anix]);
                    if (nip) {
                        ctx.highwater = anix+1;
                        ctx.highwater_list.length = 0;
                        ixes[ip.depth+1] = anix+1;
                    }
                    ip = nip || ip.next0;
                }
                else ip = ip.next0;
            }
            else {
                if (anix < ctx.math.length) {
                    var nip = ip.cases.get(ctx.math[anix]);
                    ixes[ip.depth+1] = anix+1;
                    ip = nip || ip.next0;
                }
                else ip = ip.next0;
            }
        }
        else if (ip.statement) {
            if (ctx.index >= ip.statement.index && ctx.index < ip.limit) {
                var p = ip.singleton;
                if (!p) {
                    var z = [];
                    for (var j = 0; j < ip.permute.length; j++) {
                        z[j] = child_buffer[ip.permute[j]];
                    }
                    p = new MMOMParserNode(ip.statement, z);
                }
                if (rres.tree) {
                    ctx.amb = [ ix, { end: rres.end, tree: rres.tree }, { end: anix, tree: p } ];
                }
                rres.end = anix;
                rres.tree = p;
            }
            ip = ip.next0;
        }
        else {
            var res = this._packratStep(ctx, ip.type, anix);
            if (res.tree) {
                child_buffer[ip.depth] = res.tree;
                ixes[ip.depth+1] = res.end;
                ip = ip.next1;
            }
            else {
                ip = ip.next0;
            }
        }
    }

    return memo[ix] = rres;
};

MMOMParser.prototype.parseMathString = function (goal, index, math) {
    if (this._dirty) this._buildParser();
    var goali = this._order.indexOf(goal);
    if (goali < 0) throw new TypeError('bad goal');
    var ctx = { memo: [], math: math, index: index, amb: null, highwater: undefined, highwater_list: [] };
    for (var i = 0; i < this._order.length; i++) {
        ctx.memo[i] = [];
    }
    var res = this._packratStep(ctx, goali, 0);
    if (ctx.amb)
        return { error: 'ambiguous', edata: ctx.amb, tree: null };
    if (res.tree) {
        if (res.end === math.length)
            return { error: null, edata: null, tree: res.tree };
        return { error: 'trailing-symbols', edata: res.end, tree: null };
    }

    ctx.highwater = 0;
    for (var i = 0; i < this._order.length; i++) {
        ctx.memo[i] = [];
    }
    this._packratStep(ctx, goali, 0);

    return { error: 'no-parse', edata: { highwater: ctx.highwater, highwater_list: ctx.highwater_list }, tree: null };
};

MMOMParser.prototype._parseCheckStatement = function (stmt) {
    if (stmt.type !== MMOM.Statement.ESSENTIAL && stmt.type !== MMOM.Statement.PROVABLE && stmt.type !== MMOM.Statement.AXIOM) return;
    var role = this._roles.get(stmt.math[0]);
    if (!role) {
        if (stmt.math.length) {
            if (this._order.indexOf(stmt.math[0]) >= 0) {
                if (stmt.type === MMOM.Statement.ESSENTIAL) {
                    this._addError(EL.math(stmt,0),'essen-syntax');
                }
            }
            else {
                this._addError(EL.math(stmt,0),'unconfigured-type');
            }
        }
        this._parses.set(stmt.index, null);
        return;
    }

    var res = this.parseMathString(role, stmt.index, stmt.math.slice(1));

    if (res.tree) {
        this._parses.set(stmt.index, res.tree);
        return;
    }

    if (res.error === 'ambiguous') {
        this._addError(EL.math(stmt,res.edata[0]+1),'ambiguous',{ one: res.edata[1].tree.syntax_axiom.label, two: res.edata[2].tree.syntax_axiom.label });
    }
    else if (res.error === 'no-parse') {
        if (res.edata.highwater + 1 === stmt.math.length) {
            this._addError(EL.statement(stmt),'truncated',{ expect: res.edata.highwater_list });
        }
        else {
            this._addError(EL.math(stmt,res.edata.highwater + 1), 'parse-error', { expect: res.edata.highwater_list });
        }
    }
    else if (res.error === 'trailing-symbols') {
        this._addError(EL.math(stmt, res.edata + 1), 'trailing-symbols');
    }
    else {
        throw new Error('unknown parse result code');
    }
    this._parses.set(stmt.index, null);
};

MMOMParser.prototype.parseStatement = function (stmt) {
    if (!(stmt instanceof MMOM.Statement) || stmt.database !== this._db) throw new TypeError('invalid or defunct statement');
    var parse = this._parses.get(stmt.index);
    if (parse !== undefined) return parse;

    if (stmt.type !== MMOM.Statement.ESSENTIAL && stmt.type !== MMOM.Statement.PROVABLE && stmt.type !== MMOM.Statement.AXIOM) throw new TypeError('can only get parse for e/a/p');
    this._parseCheckStatement(stmt);
    return this._parses.get(stmt.index) || null;
};

Object.defineProperty(MMOMParser.prototype, 'allErrors', { get: function () {
    if (this._dirty) this._buildParser();
    if (!this._checkedAll) {
        for (var i = 0; i < this._db.statements.length; i++) {
            this._parseCheckStatement(this._db.statements[i]);
        }
        this._checkedAll = true;
    }
    return this._errors;
} });
MMOMParser.prototype.errors = function (stmt) {
    if (!(stmt instanceof MMOM.Statement) || stmt.database !== this._db) throw new TypeError('bad statement');
    if (this._dirty) this._buildParser();
    if (stmt.type === MMOM.Statement.ESSENTIAL || stmt.type === MMOM.Statement.PROVABLE || stmt.type === MMOM.Statement.AXIOM) {
        if (!this._parses.has(stmt.index)) {
            this._parseCheckStatement(stmt);
        }
    }
    return this._errors.get(stmt) || [];
};

return MMOMParser;
});
