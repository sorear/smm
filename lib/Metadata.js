import { MMOMDatabase, MMOMStatement, MMOMErrorLocation, MMOMError } from './MMOM';
import './Scoper';

class MMOMMetadata {
    constructor(db) {
        this._db = db;
        this._scoper = db.scoper;
        this._dirty = true;
        this._errors = new Map();
        this._warned = new Set();
        this._parameters = new Map();
        this._htmldefs = new Map();
        this._db._observer.push(this);
    }
    notifyChanged(record) { this._dirty = true; }

    _scan() {
        this._errors = new Map();
        this._warned = new Set();
        this._parameters = new Map();
        this._htmldefs = new Map();
        for (let i = 0; i < this._db.statements.length; i++) {
            let stm = this._db.statements[i];
            if (stm.type !== MMOMStatement.METACOMMENT) continue;
            let parser = new MetacommentParser(stm, this);
            parser.parse();
            if (parser.errors.length) {
                this._errors.set(stm.index, parser.errors);
            }
        }
        this._dirty = false;
    }

    param(name) {
        if (REGISTRY.get(name) !== 'paramlike') throw new RangeError('Not a defined parameter type');
        if (this._dirty) this._scan();
        let rec = this._parameters.get(name);
        return rec ? rec.value : null;
    }

    tokenDef(type, token) {
        if (REGISTRY.get(type) !== 'htmldeflike') throw new RangeError('Not a defined htmldeflike type');
        if (this._dirty) this._scan();
        let l1 = this._htmldefs.get(type);
        let l2 = l1 && l1.get(token);
        let l3 = l2 && l2.value;
        return l3 === undefined ? null : l3;
    }

    get allErrors() {
        if (this._dirty) this._scan();
        return this._errors;
    }
}

MMOMError.register('metadata', 'mandatory-whitespace', 'Whitespace is required to separate these fields');
MMOMError.register('metadata', 'unclosed-subcomment', 'Subcomment starting here is not closed before end of metadata comment');
MMOMError.register('metadata', 'marker-not-first', 'Nothing may appear between the comment start and the $t marker token');
MMOMError.register('metadata', 'missing-directive', 'Expected to find a directive keyword');
MMOMError.register('metadata', 'unparsable-field', 'Cannot parse field - should be an alphabetic keyword or a quoted string');
MMOMError.register('metadata', 'plus-non-string', 'After + must be another quoted string');
MMOMError.register('metadata', 'nonterminated-string', 'String not closed on same line started');
MMOMError.register('metadata', 'missing-semicolon-eof', 'Expected ; to end directive');
MMOMError.register('metadata', 'unknown-directive', 'Not a known directive, ignoring', {warning: true});
MMOMError.register('metadata', 'duplicate-parameter', 'Parameter may only be defined once«prev:First definition:l»');
MMOMError.register('metadata', 'expected-string', 'Expected a quoted string here');
MMOMError.register('metadata', 'expected-end', 'Expected a ; (end of directive) here');
MMOMError.register('metadata', 'expected-as', 'Expected "as" separator here');
MMOMError.register('metadata', 'conflicting-htmldef', 'Typesetting already defined for this token in this mode«prev:First definition:l»');
MMOMError.register('metadata', 'htmldef-no-math', 'This token not used in the file; typesetting will be ignored', { warning: true });

var REGISTRY = new Map();
['htmltitle', 'htmlhome', 'htmlbibliography', 'exthtmltitle', 'exthtmlhome', 'exthtmllabel', 'exthtmlbibliography', 'htmlvarcolor', 'htmldir', 'althtmldir'].forEach(cmd => REGISTRY.set(cmd, 'paramlike'));
['htmldef', 'althtmldef', 'latexdef'].forEach(cmd => REGISTRY.set(cmd, 'htmldeflike'));

class MetacommentParser {
    constructor(statement, analyzer) {
        this.statement = statement;
        this.text = statement.commentText;
        this.index = 0;
        this.fieldStart = 0;
        this.fieldEnd = 0;
        this.errors = [];
        this.analyzer = analyzer;
    }

    addError(code, from, to, data) {
        this.errors.push(MMOMErrorLocation.commentSpan(this.statement, from, to).error('metadata', code, data));
        return false;
    }

    spaceOnly() {
        if (this.index < this.text.length) {
            let char = this.text.charCodeAt(this.index);
            if (char > 32 && char != 59 /*;*/) {
                this.addError('mandatory-whitespace', this.index, this.index);
            }
        }
        while (this.index < this.text.length && this.text.charCodeAt(this.index) <= 32) this.index++;
    }

    space() {
        this.spaceOnly();

        while (this.index + 1 < this.text.length && this.text.slice(this.index, this.index + 2) === '/*') {
            let close = this.text.indexOf('*/', this.index + 2);
            if (close >= 0) {
                this.index = close + 2;
                this.spaceOnly();
            }
            else {
                this.addError('unclosed-subcomment', this.index, this.index+2);
                this.index = this.text.length;
            }
        }
    }

    keyword() {
        // [a-z]+
        this.fieldStart = this.index;
        let char;
        while (this.index < this.text.length && (char = this.text.charCodeAt(this.index)) >= 97/*a*/ && char <= 122/*z*/)
            this.index++;

        if (this.index === this.fieldStart)
            return null;

        this.fieldEnd = this.index;
        this.space();

        return this.text.slice(this.fieldStart, this.fieldEnd);
    }

    string() {
        this.fieldStart = this.index;

        let first = true, repeat = true, buffer = '';
        while (repeat) {
            let char;
            if (this.index === this.text.length || ((char = this.text.charCodeAt(this.index)) !== 34/*"*/ && char !== 39/*'*/)) {
                if (first) return null;
                this.addError('plus-non-string', this.index, this.index);
                break;
            }
            let quote = char;
            let stringStart = this.index;
            this.index++;

            while (true) {
                let start = this.index;
                while (this.index < this.text.length &&
                        (char = this.text.charCodeAt(this.index)) !== quote && char !== 13 && char !== 10) this.index++;

                buffer += this.text.slice(start, this.index);
                if (char === quote) {
                    if (this.index + 1 < this.text.length && this.text.charCodeAt(this.index + 1) === quote) {
                        buffer += this.text.slice(this.index, this.index + 1);
                        this.index += 2;
                    }
                    else {
                        this.index++;
                        break;
                    }
                }
                else {
                    this.addError('nonterminated-string', stringStart, this.index);
                    break; // keep the space if there was one
                }
            }

            this.fieldEnd = this.index;
            this.space();

            repeat = first = false;

            if (this.index < this.text.length && this.text.charCodeAt(this.index) === 43/*+*/) {
                this.index++;
                this.space();
                repeat = true;
            }
        }

        return buffer;
    }

    unknown() {
        this.fieldStart = this.index;
        while (this.index < this.text.length && this.text.charCodeAt(this.index) > 32) this.index++;
        this.fieldEnd = this.index;

        if (this.fieldEnd === this.fieldStart) {
            return false;
        }
        else {
            this.addError('unparsable-field', this.fieldStart, this.fieldEnd);
            this.space();
            return true;
        }
    }

    semicolon() {
        if (this.index === this.text.length) {
            this.addError('missing-semicolon-eof', this.index, this.index);
            return true;
        }

        if (this.text.charCodeAt(this.index) === 59/*;*/) {
            this.index++;
            this.fieldEnd = this.index;
            this.space();
            return true;
        }

        return false;
    }

    paramlike(name) {
        let start = this.fieldStart;
        let data = this.string();
        if (data === null)
            return this.addError('expected-string', this.index, this.index);

        if (!this.semicolon())
            return this.addError('expected-end', this.index, this.index);
        let end = this.fieldEnd;

        let old = this.analyzer._parameters.get(name);
        if (old) {
            this.addError('duplicate-parameter', start, end, { prev: MMOMErrorLocation.commentSpan(old.statement, old.from, old.to) });
        }
        else {
            this.analyzer._parameters.set(name, { value: data, statement: this.statement, from: start, to: end });
        }
        return true;
    }

    htmldeflike(name) {
        let start = this.fieldStart;
        let token = this.string();
        if (token === null)
            return this.addError('expected-string', this.index, this.index);
        let tokenStart = this.fieldStart, tokenEnd = this.fieldEnd;
        let noise = this.keyword();
        if (noise === null)
            return this.addError('expected-as', this.index, this.index);
        if (noise !== 'as')
            return this.addError('expected-as', this.fieldStart, this.fieldEnd);
        let defn = this.string();
        if (defn === null)
            return this.addError('expected-string', this.index, this.index);
        if (!this.semicolon())
            return this.addError('expected-end', this.index, this.index);
        let end = this.fieldEnd;

        let sym = this.analyzer._scoper.lookup(token);
        if (!sym || !sym.math.length)
            this.addError('htmldef-no-math', tokenStart, tokenEnd);

        let l1 = this.analyzer._htmldefs.get(name);
        if (!l1) this.analyzer._htmldefs.set(name, l1 = new Map());

        let old = l1.get(token);
        if (old) {
            this.addError('conflicting-htmldef', start, end, { prev: MMOMErrorLocation.commentSpan(old.statement, old.from, old.to) });
        }
        else {
            l1.set(token, { value: defn, statement: this.statement, from: start, to: end });
        }

        return true;
    }

    directive() {
        let head = this.keyword();
        if (!head) {
            this.addError('missing-directive', this.index, this.index);
            return false;
        }

        let handler = REGISTRY.get(head);
        if (handler) return this[handler](head);

        if (!this.analyzer._warned.has(head)) {
            this.analyzer._warned.add(head);
            this.addError('unknown-directive', this.fieldStart, this.fieldEnd);
        }

        return false;
    }

    parse() {
        this.spaceOnly();

        // parse initial $t
        if (this.text.slice(this.index, this.index + 2) === '$t') {
            this.index += 2;
            this.space();
        }
        else {
            this.addError('marker-not-first', this.index, this.index);
        }

        while (this.index < this.text.length) {
            if (this.directive())
                continue;

            // Failed to grammatically parse a directive - skip until ;
            while (!this.semicolon())
                this.keyword() || (this.string() !== null) || this.unknown();
        }
    }
}

MMOMDatabase.registerAnalyzer('metadata', MMOMMetadata);
