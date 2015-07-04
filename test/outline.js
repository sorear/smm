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
A cha'pter&#3080;
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
    it('finds the outlines and only the outlines', () => expect(dbt().outlineNodes.length).to.equal(3));
    it('finds minimum level', () => expect(dbt().outlineLevelBase).to.equal(1));
    it('finds maximum level', () => expect(dbt().outlineLevelsUsed).to.equal(3));
    describe('first outline comment', () => {
        it('statement #', () => expect(dbt().outlineNodes[0].statement.index).to.equal(0));
        it('level', () => expect(dbt().outlineNodes[0].level).to.equal(1));
        it('title', () => expect(dbt().outlineNodes[0].title).to.equal('A part'));
        it('slug', () => expect(dbt().outlineNodes[0].slug).to.equal('a-part'));
        it('no prologue', () => expect(dbt().outlineNodes[0].prologue).to.equal(''));
    })
    describe('second outline comment', () => {
        it('statement #', () => expect(dbt().outlineNodes[1].statement.index).to.equal(3));
        it('level', () => expect(dbt().outlineNodes[1].level).to.equal(2));
        it('title', () => expect(dbt().outlineNodes[1].title).to.equal('A cha\'pter&#3080;'));
        it('slug', () => expect(dbt().outlineNodes[1].slug).to.equal('a-chapter'));
        it('no prologue', () => expect(dbt().outlineNodes[1].prologue).to.equal(''));
    });;
    describe('third outline comment', () => {
        it('statement #', () => expect(dbt().outlineNodes[2].statement.index).to.equal(4));
        it('level', () => expect(dbt().outlineNodes[2].level).to.equal(3));
        it('title', () => expect(dbt().outlineNodes[2].title).to.equal('A section, with prose'));
        it('slug', () => expect(dbt().outlineNodes[2].slug).to.equal('a-section-with-prose'));
        it('prologue', () => expect(dbt().outlineNodes[2].prologue).to.equal('This is\ncommentary'));
    });
});

describeDB('Outline fetching for statements', `
$( $)
$(
####
P1
$)

$(
=-=-
S1
$)

$(
#*#*
C1
$)

$(
=-=-
S2
$)

$(
#*#*
C1
$)
`, dbt => {
    it('outline for #0', () => expect(dbt().statement(0).outlineNode.path.map(x => x.slug)).to.eql(['_top']));
    it('outline for #0 ord', () => expect(dbt().statement(0).outlineNode.path.map(x => x.ordinal)).to.eql([0]));
    it('outline for #1', () => expect(dbt().statement(1).outlineNode.path.map(x => x.slug)).to.eql(['p1']));
    it('outline for #1 ord', () => expect(dbt().statement(1).outlineNode.path.map(x => x.ordinal)).to.eql([1]));
    it('outline for #2', () => expect(dbt().statement(2).outlineNode.path.map(x => x.slug)).to.eql(['p1','_top','s1']));
    it('outline for #2 ord', () => expect(dbt().statement(2).outlineNode.path.map(x => x.ordinal)).to.eql([1,0,1]));
    it('outline for #3', () => expect(dbt().statement(3).outlineNode.path.map(x => x.slug)).to.eql(['p1','c1']));
    it('outline for #3 ord', () => expect(dbt().statement(3).outlineNode.path.map(x => x.ordinal)).to.eql([1,1]));
    it('outline for #4', () => expect(dbt().statement(4).outlineNode.path.map(x => x.slug)).to.eql(['p1','c1','s2']));
    it('outline for #4 ord', () => expect(dbt().statement(4).outlineNode.path.map(x => x.ordinal)).to.eql([1,1,1]));
    it('outline for #5', () => expect(dbt().statement(5).outlineNode.path.map(x => x.slug)).to.eql(['p1','c1-2']));
    it('outline for #5 ord', () => expect(dbt().statement(5).outlineNode.path.map(x => x.ordinal)).to.eql([1,2]));
});
