import { MMOMDatabase, MMOMStatement, MMOMErrorLocation, MMOMError } from './MMOM';

class MMOMMetadata {
    constructor(db) {
        this._db = db;
        this._dirty = true;
        this._errors = new Map();
        this._warned = new Set();
    }

    _scan() {
        this._errors = new Map();
        this._warned = new Set();
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

class MetacommentParser {
    constructor(statement, analyzer) {
        this.statement = statement;
        this.text = statement.commentText();
        this.index = 0;
        this.fieldStart = 0;
        this.fieldEnd = 0;
        this.errors = [];
        this.warned = analyzer._warned;
    }

    addError(code, from, to, data) {
        this.errors.push(MMOMErrorLocation.commentSpan(this.statement, from, to).error('metadata', code, data));
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
                        buffer += this.text.slice(this.index, 1);
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
            this.space();
            return true;
        }

        return false;
    }

    directive() {
        let head = this.keyword();
        if (!head) {
            this.addError('missing-directive', this.index, this.index);
            return false;
        }

        if (!this.warned.has(head)) {
            this.warned.add(head);
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
