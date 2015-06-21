import { parseSync, MMOMDatabase, MMOMStatement } from '../lib/MMOM';
import { expect } from 'chai';

describe('Database methods:', () => {
    describe('parseSync', () => {
        it('returns a database', () => {
            expect(parseSync('name', x => '')).to.be.an.instanceof(MMOMDatabase);
        });
        it('returns a database for parse errors', () => {
            expect(parseSync('name', x => '$$')).to.be.an.instanceof(MMOMDatabase);
        });
        it('returns parse errors on the database', () => {
            expect(parseSync('name', x => '$$').scanner.errors).to.have.length(1);
        });
    });

    describe('statementCount', () => {
        it('counts statements', () => {
            expect(parseSync('afile', x => '${ ${ $} $}').statementCount).to.equal(4);
        });
        it('also counts comments', () => {
            expect(parseSync('afile', x => '${ $( $) $}').statementCount).to.equal(3);
        });
    });

    describe('text', () => {
        it('round trips', () => {
            expect(parseSync('afile', x => '${ ${ $} $}').text).to.equal('${ ${ $} $}');
        });
    });

    describe('statement(ix)', () => {
        it('fetches MMOMStatement objects', () => {
            expect(parseSync('afile', x => '$( a $)').statement(0)).to.be.an.instanceof(MMOMStatement);
        });
        it('returns the statement with the proper index', () => {
            expect(parseSync('afile', x => '${ $} ${ $}').statement(2).index).to.equal(2);
        });
        it('can fetch raw', () => {
            expect(parseSync('afile', x => '$( A $) $( B $) $( C $)').statement(1).raw).to.equal(' $( B $)');
        });
    });

    describe('replaceStatements()', () => {
        it('throws if there are any errors', () => {
            expect(() => parseSync('afile', '$$').replaceStatements(0,0,' $( $) ')).to.throw(/low level syntax errors/);
        });
        it('throws if from out of range', () => {
            expect(() => parseSync('afile', '$( X $)').replaceStatements(-1,0,' $( $) ')).to.throw(/range of statements/);
        });
        it('throws if to out of range', () => {
            expect(() => parseSync('afile', '$( X $)').replaceStatements(3,3,' $( $) ')).to.throw(/range of statements/);
        });
        it('throws if range reversed', () => {
            expect(() => parseSync('afile', '$( X $)').replaceStatements(1,0,' $( $) ')).to.throw(/range of statements/);
        });
        it('throws if inserting errors', () => {
            expect(() => parseSync('afile', '$( X $)').replaceStatements(1,1,' $$')).to.throw(/with syntax errors/);
        });
        it('throws if inserting after but no leading space', () => {
            expect(() => parseSync('afile', '$( X $)').replaceStatements(1,1,'$( Y $)')).to.throw(/lead with whitespace/);
        });
        it('throws if inserting before but no trailing space', () => {
            expect(() => parseSync('afile', '$( X $)').replaceStatements(0,0,'$( Y $)')).to.throw(/have leading whitespace/);
        });
        it('throws if inserting a new EOF not at end', () => {
            expect(() => parseSync('afile', '$( X $) $( Y $)').replaceStatements(1,1,' $( Z $) ')).to.throw(/insert EOF whitespace statement before end/);
        });
        it('throws if inserting after EOF', () => {
            expect(() => parseSync('afile', '$( X $) ').replaceStatements(2,2,' $( Z $)')).to.throw(/after EOF whitespace/);
        });
        describe('works in-place,', () => {
            let db; before(() => { db = parseSync('afile', '$( A $) $( B $) $( C $) $( D $)'); db.replaceStatements(1,2,' $( E $)'); });
            it('setting correct sequence', () => { expect(db.text).to.equal('$( A $) $( E $) $( C $) $( D $)'); });
            it('sets database on new statement', () => { expect(db.statement(1).database).to.equal(db); });
            it('sets index on new statement', () => { expect(db.statement(1).index).to.equal(1); });
            it('preserves index on old statement', () => { expect(db.statement(2).index).to.equal(2); });
        });
        describe('works growing gap,', () => {
            let db; before(() => { db = parseSync('afile', '$( A $) $( B $) $( C $) $( D $)'); db.replaceStatements(1,2,' $( E $) $( F $)'); });
            it('setting correct sequence', () => { expect(db.text).to.equal('$( A $) $( E $) $( F $) $( C $) $( D $)'); });
            it('sets database on new statement 1', () => { expect(db.statement(1).database).to.equal(db); });
            it('sets database on new statement 2', () => { expect(db.statement(2).database).to.equal(db); });
            it('sets index on new statement 1', () => { expect(db.statement(1).index).to.equal(1); });
            it('sets index on new statement 2', () => { expect(db.statement(2).index).to.equal(2); });
            it('updates index on old statement 1', () => { expect(db.statement(3).index).to.equal(3); });
            it('updates index on old statement 2', () => { expect(db.statement(4).index).to.equal(4); });
        });
        describe('works shrinking gap,', () => {
            let db; before(() => { db = parseSync('afile', '$( A $) $( B $) $( C $) $( D $)'); db.replaceStatements(1,2,''); });
            it('setting correct sequence', () => { expect(db.text).to.equal('$( A $) $( C $) $( D $)'); });
            it('updates index on old statement 1', () => { expect(db.statement(1).index).to.equal(1); });
            it('updates index on old statement 2', () => { expect(db.statement(2).index).to.equal(2); });
        });
    });
});
