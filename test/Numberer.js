import { MMOMStatement, parseSync } from '../lib/MMOM';
import { describeDB } from './lib/Util';
import { expect } from 'chai';
import '../lib/Numberer';
import '../lib/Scoper';

describe('Numberer analyzer:', () => {
    describeDB('Test database', '$( Comment $) ${ $c X $. $( Another $) $( And another $) A $a X $. B $a X $. $}', dbt => {
        it('has 3 comments', () => expect(dbt().numberer.counts[MMOMStatement.COMMENT]).to.equal(3));
        it('has 2 axioms', () => expect(dbt().numberer.counts[MMOMStatement.AXIOM]).to.equal(2));
        it('first real statement has metamathNumber 1', () => expect(dbt().statement(1).metamathNumber).to.equal(1));
        it('third real statement has metamathNumber 3', () => expect(dbt().scoper.lookup('A').labelled.metamathNumber).to.equal(3));
        it('first axiom has pinkNumber 1', () => expect(dbt().scoper.lookup('A').labelled.pinkNumber).to.equal(1));
        it('second axiom has pinkNumber 2', () => expect(dbt().scoper.lookup('B').labelled.pinkNumber).to.equal(2));
        it('lookup by pinkNumber(1)', () => expect(dbt().statementByPinkNumber(1).label).to.equal('A'));
        it('lookup by pinkNumber(2)', () => expect(dbt().statementByPinkNumber(2).label).to.equal('B'));
        it('lookup by metamathNumber(2)', () => expect(dbt().statementByMetamathNumber(2).raw).to.equal(' $c X $.'));
        it('lookup throws if out of range (1)', () => expect(() => dbt().statementByPinkNumber(0)).to.throw(/out of range/));
        it('lookup throws if out of range (2)', () => expect(() => dbt().statementByPinkNumber(3)).to.throw(/out of range/));
        it('fetching metamathNumber throws for comments', () => expect(() => dbt().statement(0).metamathNumber).to.throw(/statement does not have a metamathNumber/));
        it('fetching pinkNumber throws for non-$a/$p', () => expect(() => dbt().statement(1).pinkNumber).to.throw(/statement does not have a pinkNumber/));
    });

    describe('handles updates:', () => {
        let db;
        before(() => {
            db = parseSync('afile', '$c X $. $( A $) A $a X $. $( B $) B $a X $. $( C $) C $a X $.');
            db.numberer.counts;
            db.replaceStatements(1,1,' N $a X $.');
        });
        it('updates counts', () => expect(db.numberer.counts[MMOMStatement.AXIOM]).to.equal(4));
        it('can calculate pinkNumber for new', () => expect(db.statement(1).pinkNumber).to.equal(1));
        it('can calculate pinkNumber for existing 1', () => expect(db.statement(5).pinkNumber).to.equal(3));
        it('can calculate pinkNumber for existing 2', () => expect(db.statement(7).pinkNumber).to.equal(4));
        it('can lookup new by pinkNumber', () => expect(db.statementByPinkNumber(1).index).to.equal(1));
        it('can lookup existing by pinkNumber', () => expect(db.statementByPinkNumber(4).index).to.equal(7));
    });
});
