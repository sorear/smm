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
    this._rules = new Map();
    this._extractRules();
    this._dirty = false;
    this._checkedAll = false;
};

MMOMParser.prototype._extractRules = function () {
    this._scoper._update(); // required for getFrame
    for (var i = 0; i < this._order.length; i++) {
        this._index[i] = [];
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
                this._index[order].push(rule);
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
            }
            else {
                commands.push({ lit: stmt.math[j], index: -1, type: -1 });
            }
        }

        if (!bad) {
            var rule = {
                stmt: stmt, arity: frame.mand.length, commands: commands, type: stmt.math[0], limit: this._scoper.statementScopeEnd(stmt)
            };
            this._index[order].push(rule);
            this._rules.set(stmt.index, rule);
        }
    }
};

function MMOMParserNode(syntax_axiom, children) {
    this.syntax_axiom = syntax_axiom;
    this.children = children;
}
MMOMParserNode.prototype.dump = function () { return this.syntax_axiom.label + '(' + this.children.map(function (x) { return x.dump(); }).join(',') + ')'; };
MMOMParser.Node = MMOMParserNode;

var STOP = { end: 0, tree: null };
MMOMParser.prototype._packratTryRule = function (ctx, data, ix) {
    if (ctx.index < data.stmt.index || ctx.index >= data.limit) return STOP;
    var children = [];
    for (var j = 0; j < data.commands.length; j++) {
        if (data.commands[j].index >= 0) {
            var res = this._packratStep(ctx, data.commands[j].type, ix);
            if (!res.tree) return STOP;
            ix = res.end;
            children[data.commands[j].index] = res.tree;
        }
        else {
            if (ix >= ctx.math.length || ctx.math[ix] !== data.commands[j].lit) {
                if (j !== 0 && ctx.highwater === ix) ctx.highwater_list.push(data.commands[j].lit);
                return STOP;
            }
            else {
                ix++;
                if (ctx.highwater !== undefined && ix > ctx.highwater) {
                    ctx.highwater = ix;
                    ctx.highwater_list.length = 0;
                }
            }
        }
    }

    return { end: ix, tree: new MMOMParserNode(data.stmt, children) };
};

MMOMParser.prototype._packratStep = function (ctx, type, ix) {
    var memo = ctx.memo[type];
    if (memo[ix]) return memo[ix];
    //console.log('Looking for',type,'at',ix);
    var choices = this._index[type];
    var parse;

    if (ctx.highwater === ix) {
        ctx.highwater_list.push(this._order[type]);
    }

    for (var i = 0; i < choices.length; i++) {
        var res = this._packratTryRule(ctx, choices[i], ix);
        if (res.tree) {
            if (parse) ctx.amb = [ix, parse, res];
            parse = res;
        }
    }

    //console.log('For',type,'at',ix,':',parse ? parse.tree.dump() : '(fail)');
    return memo[ix] = (parse || STOP);
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
