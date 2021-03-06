import { MMOMDatabase, MMOMErrorLocation as EL, MMOMError, MMOMStatement } from './mmom';
import './scoper';
import './metadata';

class MMOMParserNode {
    constructor(syntax_axiom, children) {
        this.syntax_axiom = syntax_axiom;
        this.children = children;
    }

    dump() { return this.syntax_axiom.label + '(' + this.children.map(function (x) { return x.dump(); }).join(',') + ')'; }
}

class FactorTree {
    constructor(nt_depth) {
        this.nt_depth = nt_depth;
        this.leaves = [];
        this.nonterminals = [];
        this.terminals = new Map();
    }

    addLeaf(stmt, limit, permute) {
        this.leaves.push({ stmt: stmt, limit: limit, permute: permute });
    }

    addTerminal(tok) {
        var next = this.terminals.get(tok);
        if (!next) this.terminals.set(tok, next = new FactorTree(this.nt_depth));
        return next;
    }

    addNonterminal(goali) {
        var next = this.nonterminals[goali];
        if (!next) this.nonterminals[goali] = next = new FactorTree(this.nt_depth+1);
        return next;
    }

    toThread(depth,cont) {
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
    }

    initial(initials) {
        var res = new Set();
        this.terminals.forEach(function (v, k) { res.add(k); });
        if (this.leaves.length) return null; // epsilon rule
        for (var i = 0; i < this.nonterminals.length; i++) {
            if (this.nonterminals[i]) {
                if (!initials[i]) return null;
                initials[i].forEach(function (k) { res.add(k); });
            }
        }
        return res;
    }
}

class FactorThread {
    constructor(depth, statement, limit, permute, typeIndex, cases, next0, next1) {
        this.depth = depth;
        this.statement = statement;
        this.singleton = null;
        this.limit = limit;
        this.permute = permute;
        this.typeIndex = typeIndex;
        this.cases = cases;
        this.next0 = next0;
        this.next1 = next1;

        if (this.statement && !this.permute.length) {
            this.singleton = new MMOMParserNode(this.statement, []);
        }
    }
}

class MMOMParser {
    constructor(db) {
        this._db = db;
        this._dirty = true; // for the parser itself
        this._db._observer.push(this);
        this._checkedAll = false;
        this._scoper = db.scoper;
        this._metadata = db.metadata;
        this._errors = new Map();
        this._index = [];
        this._thread = [];
        this._initial = [];
        this._rules = new Map();
        this._parses = new Map();
        this._order = [];
        this._roles = new Map();
    }

    notifyChanged(record) { this._dirty = true; }

    _addError(loc,code,data) {
        var l1 = this._errors.get(loc.statement);
        if (!l1) {
            this._errors.set(loc.statement, l1 = []);
        }
        l1.push(loc.error('parser', code, data));
    }

    _buildParser() {
        this._order = [];
        this._roles = new Map();
        this._errors = new Map();
        this._index = [];
        this._thread = [];
        this._initial = [];
        this._rules = new Map();
        this._parses = new Map();
        this._dirty = false;
        this._checkedAll = false;

        this._extractCategories();
        this._order = this._db.metadata.param('-smm-syntactic-categories') || [];
        let roles_param = this._db.metadata.param('-smm-logical-categories') || [];
        for (let i = 0; i < roles_param.length; i += 2) {
            this._roles.set(roles_param[i], roles_param[i+1]);
        }

        if (this._order.length) this._extractRules();
    }

    _extractCategories() {
        let order = this._metadata.param('-smm-syntactic-categories') || [];
        let dups = order.filter((val, ix) => order.indexOf(val) !== ix)[0];
        if (dups !== undefined) {
            return this._addError(this._metadata._paramLocation('-smm-syntactic-categories'), 'syntactic-category-repeated', { symbol: dups });
        }
        let roles_param = this._db.metadata.param('-smm-logical-categories') || [];
        if (roles_param.length % 2) {
            return this._addError(this._metadata._paramLocation('-smm-logical-categories'), 'logical-category-unpaired', { symbol: roles_param[roles_param.length - 1] });
        }

        let roles = new Map();
        for (let i = 0; i < roles_param.length; i += 2) {
            let logsym = roles_param[i], role = roles_param[i+1];
            if (order.indexOf(logsym) >= 0 || roles.has(logsym)) {
                return this._addError(this._metadata._paramLocation('-smm-logical-categories'), 'logical-category-repeated', { symbol: logsym });
            }
            if (order.indexOf(role) < 0) {
                return this._addError(this._metadata._paramLocation('-smm-logical-categories'), 'logical-category-syntax-undeclared', { symbol: role });
            }
            roles.set(logsym, role);
        }
        this._roles = roles;
        this._order = order;
    }

    _extractRules() {
        this._scoper._update(); // required for getFrame
        for (var i = 0; i < this._order.length; i++) {
            this._index[i] = new FactorTree(0);
        }

        for (var i = 0; i < this._db.statements.length; i++) {
            var stmt = this._db.statements[i];

            if (stmt.type === MMOMStatement.FLOATING) {
                if (stmt.math.length !== 2) continue;
                var order = this._order.indexOf(stmt.math[0]);
                var bad = false;
                if (order < 0) {
                    this._addError(EL.math(stmt,0), 'float-not-syntax');
                    bad = true;
                }
                if (!bad) {
                    var rule = {
                        stmt: stmt, arity: 0, slots: [{ lit: stmt.math[1], index: -1, typeIndex: -1, type: '' }], type: stmt.math[0], limit: this._scoper.statementScopeEnd(stmt)
                    };
                    this._index[order].addTerminal(stmt.math[1]).addLeaf(stmt, rule.limit, []);
                    this._rules.set(stmt.index, rule);
                }
                continue;
            }
            else if (stmt.type !== MMOMStatement.AXIOM) {
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
            var slots = [];
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

                    slots.push({ lit: stmt.math[j], index: float, typeIndex: reforder, type: type });
                    permute[float] = j-1;
                    cursor = cursor.addNonterminal(reforder);
                }
                else {
                    slots.push({ lit: stmt.math[j], index: -1, typeIndex: -1, type: '' });
                    cursor = cursor.addTerminal(stmt.math[j]);
                }
            }

            if (!bad) {
                var rule = {
                    stmt: stmt, arity: frame.mand.length, slots: slots, type: stmt.math[0], limit: this._scoper.statementScopeEnd(stmt)
                };
                cursor.addLeaf(stmt, rule.limit, permute);
                this._rules.set(stmt.index, rule);
            }
        }

        for (var i = 0; i < this._order.length; i++) {
            this._thread[i] = this._index[i].toThread(0, null);
            this._initial[i] = this._index[i].initial(this._initial); // note that left-recursion is only allowed to things earlier in the order
        }
    }

    _packratStep(ctx, typeIndex, ix) {
        var memo = ctx.memo[typeIndex];
        if (memo[ix]) return memo[ix];
        if (ctx.highwater === ix) { ctx.highwater_list.push('$' + this._order[typeIndex]); }

        var ip = this._thread[typeIndex];
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
                var res;
                if ((!this._initial[ip.typeIndex] || ctx.highwater !== undefined || this._initial[ip.typeIndex].has(ctx.math[anix])) &&
                        (res = this._packratStep(ctx, ip.typeIndex, anix)).tree) {
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
    }

    parseMathString(goal, index, math) {
        if (this._dirty) this._buildParser();
        if (!this.hasStatementSyntax) throw new TypeError('database has no statement syntax');
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
    }

    _parseCheckStatement(stmt) {
        if (stmt.type !== MMOMStatement.ESSENTIAL && stmt.type !== MMOMStatement.PROVABLE && stmt.type !== MMOMStatement.AXIOM) return;
        var role = this._roles.get(stmt.math[0]);
        if (!role) {
            if (stmt.math.length) {
                if (this._order.indexOf(stmt.math[0]) >= 0) {
                    if (stmt.type === MMOMStatement.ESSENTIAL) {
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
    }

    get hasStatementSyntax() {
        if (this._dirty) this._buildParser();
        return !!this._order.length;
    }

    get allErrors() {
        if (this._dirty) this._buildParser();
        if (!this.hasStatementSyntax) return this._errors;
        if (!this._checkedAll) {
            for (var i = 0; i < this._db.statements.length; i++) {
                this._parseCheckStatement(this._db.statements[i]);
            }
            this._checkedAll = true;
        }
        return this._errors;
    }

    errors(stmt) {
        if (!(stmt instanceof MMOMStatement) || stmt.database !== this._db) throw new TypeError('bad statement');
        if (this._dirty) this._buildParser();
        if (stmt.type === MMOMStatement.ESSENTIAL || stmt.type === MMOMStatement.PROVABLE || stmt.type === MMOMStatement.AXIOM) {
            if (!this._parses.has(stmt.index)) {
                this._parseCheckStatement(stmt);
            }
        }
        return this._errors.get(stmt) || [];
    }
}

Object.defineProperty(MMOMStatement.prototype, 'parsingRule', { get: function () {
    let self = this.database.parser;
    if (self._dirty) self._buildParser();
    return self._rules.get(this.index);
} });

// null: statement cannot be parsed, there will be errors
// undefined: database has no syntax defs
Object.defineProperty(MMOMStatement.prototype, 'assertionParseTree', { get: function () {
    let self = this.database.parser;
    let parse = self._parses.get(this.index);
    if (parse !== undefined) return parse;

    if (this.type !== MMOMStatement.ESSENTIAL && this.type !== MMOMStatement.PROVABLE && this.type !== MMOMStatement.AXIOM) throw new TypeError('can only get parse for e/a/p');
    if (!self.hasStatementSyntax) return undefined;
    self._parseCheckStatement(this);
    return self._parses.get(this.index) || null;
} });

MMOMDatabase.registerAnalyzer('parser', MMOMParser);

MMOMError.register('parser', 'float-not-syntax', 'Type code of $f statement must be a syntactic type code');
MMOMError.register('parser', 'syntax-with-e', 'Axiom with a syntactic type code must not have $e hypotheses«hyp:Hypothesis:l»');
MMOMError.register('parser', 'syntax-with-dv', 'Axiom with a syntactic type code must not have mandatory disjoint variable conditions («left:m», «right:m»)');
MMOMError.register('parser', 'syntax-repeat-var', 'Variable may not be used more than once in a syntactic axiom«prev:Previous use:l»');
MMOMError.register('parser', 'syntax-ref-nonsyntax', 'Syntactic axiom may not reference non-syntactic variables');
MMOMError.register('parser', 'syntax-left-recursive', 'A syntax axiom may only left recurse into rules with tighter type codes');
MMOMError.register('parser', 'essen-syntax', 'A $e hypothesis may not use a syntactic category');
MMOMError.register('parser', 'unconfigured-type', 'Unconfigured type code');
MMOMError.register('parser', 'ambiguous', 'Grammatical ambiguity detected; from here can be parsed «one:s» or «two:s»');
MMOMError.register('parser', 'parse-error', 'Parsing failed here; expected any of: «expect:m»');
MMOMError.register('parser', 'truncated', 'Statement is incomplete; expected any of: «expect:m»');
MMOMError.register('parser', 'trailing-symbols', 'Unexpected symbols after statement');
MMOMError.register('parser', 'syntactic-category-repeated', 'Syntactic category «symbol:s» is listed twice');
MMOMError.register('parser', 'logical-category-unpaired', 'Logical category «symbol:s» is missing a syntactic category');
MMOMError.register('parser', 'logical-category-syntax-undeclared', 'No such syntactic category «symbol:s» for logical category');
MMOMError.register('parser', 'logical-category-repeated', 'Logical category «symbol:s» defined twice');
