import { describeDB } from './lib/util';
import { expect } from 'chai';
import '../lib/smm/outline';

describeDB('Outline extraction', `
$(
#####
A part
$)

$( Not outliney $)

$(
  #####
  Not outliney
$)

$(
#*#*
A chapter
#*#*
$)

$(
=-=-=-=-=-=-
    A section, with prose 
=-=-=-=-=-
This is
commentary
$)
`, dbt => {
    it('finds the outlines and only the outlines', () => expect(dbt().outlineEntries.length).to.equal(3));
    describe('first outline comment', () => {
        it('statement #', () => expect(dbt().outlineEntries[0].statement.index).to.equal(0));
        it('title', () => expect(dbt().outlineEntries[0].title).to.equal('A part'));
        it('no prologue', () => expect(dbt().outlineEntries[0].prologue).to.equal(''));
    })
    describe('second outline comment', () => {
        it('statement #', () => expect(dbt().outlineEntries[1].statement.index).to.equal(3));
        it('title', () => expect(dbt().outlineEntries[1].title).to.equal('A chapter'));
        it('no prologue', () => expect(dbt().outlineEntries[1].prologue).to.equal(''));
    });;
    describe('third outline comment', () => {
        it('statement #', () => expect(dbt().outlineEntries[2].statement.index).to.equal(4));
        it('title', () => expect(dbt().outlineEntries[2].title).to.equal('A section, with prose'));
        it('prologue', () => expect(dbt().outlineEntries[2].prologue).to.equal('This is\ncommentary'));
    });
});
