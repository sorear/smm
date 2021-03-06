import { describeDB, testErrorMap } from './lib/util';
import { expect } from 'chai';
import '../lib/smm/parser';

let TYPESPEC = " $( $t -smm-syntactic-categories 'set' 'class' 'wff'; -smm-logical-categories '|-' 'wff'; $)";
let LANG = '$c |- wff ( ) A $. $v ph ps $. f0 $f wff ph $. f1 $f wff ps $. w0 $a wff A $. w1 $a wff ( ph ps ) $. ';
let cases = [
    { name: '$f (ok)', src: '$c wff $.  $v ph $.  wph $f wff ph $.', err: { wph: [] } },
    { name: '$f (unknown)', src: '$c term $.  $v ph $.  wph $f term ph $.', err: { wph: [[ [29,33], 'parser/float-not-syntax' ]] } },
    { name: '$f (not syntax)', src: '$c |- $.  $v ph $.  wph $f |- ph $.', err: { wph: [[ [27,29], 'parser/float-not-syntax' ]] } },

    { name: 'invalid $a', src: 'wph $a $.', err: { } },
    { name: '$a/$e', src: '$c class |- wff X $. a0 $a wff class $. c0e $e |- class $. c0 $a class X $.', err: { c0: [[ [59,61], 'parser/syntax-with-e', {hyp: [40,43]} ]] } },
    { name: '$a/$d', src: '$c class X $. $v A B $. cA $f class A $. cB $f class B $. $d A B $. cX $a class X A B $.', err: { cX: [[[68,70], 'parser/syntax-with-dv', { left: 'B', right: 'A' } ]] } },
    { name: '$a/repeat', src: '$c class X $. $v A B $. cA $f class A $. cB $f class B $. cX $a class X A A $.', err: { cX: [[[74,75], 'parser/syntax-repeat-var', { prev: [72,73] }]] } },
    { name: '$a/recurse 1', src: '$c class X $. $v A B $. cA $f class A $. cB $f class B $. cX $a class A X $.', err: { cX: [[[70,71], 'parser/syntax-left-recursive' ]] } },
    { name: '$a/recurse 2', src: '$c class set X $. $v A B $. cA $f class A $. cB $f set B $. cX $a class B $.', err: {} },

    { name: 'no role $e', src: '$c X $.  eX $e X $.', err: { eX: [[[15,16], 'parser/unconfigured-type' ]] } },
    { name: 'syntax $e', src: '$c wff X $.  eX $e wff X $.', err: { eX: [[[19,22], 'parser/essen-syntax' ]] } },
    { name: 'syntax $p ok', src: '$c wff X $.  eX $p wff X $= ? $.', err: { } },
    { name: 'ambiguous', src: '$c |- wff A $. wA1 $a wff A $. wA2 $a wff A $. ax $a |- A $.', err: { ax: [[[56,57],'parser/ambiguous', {one: 'wA1', two: 'wA2' } ]] } },
    { name: 'no parse', src: LANG + 'test $a |- ( A ) $.', err: { test: [[[116,117], 'parser/parse-error', { expect: ['$wff'] } ]] } },
    { name: 'truncated', src: LANG + 'test $a |- ( A A $.', err: { test: [[[101,105], 'parser/truncated', { expect: [')'] }]] } },
    { name: 'valid', src: LANG + 'test $a |- ( A ( A A ) ) $.', err: { test: [] }, tree: { test: 'w1(w0(),w1(w0(),w0()))' } },

    { name: 'no syntax no problem', src: '$c X $. a0 $a X X $. $( $t $)', err: {} },
    { name: 'duplicated syncat', src: '$( $t -smm-syntactic-categories "foo" "foo"; $)', err: { '0': [[[6,44],'parser/syntactic-category-repeated',{symbol:'foo'}]] } },
    { name: 'odd length roles', src: '$( $t -smm-logical-categories "foo"; $)', err: { '0': [[[6,36],'parser/logical-category-unpaired',{symbol:'foo'}]] } },
    { name: 'undeclared roles', src: '$( $t -smm-logical-categories "foo" "bar"; $)', err: { '0': [[[6,42],'parser/logical-category-syntax-undeclared',{symbol:'bar'}]] } },
    { name: 'repeated roles', src: '$( $t -smm-syntactic-categories "bar"; -smm-logical-categories "foo" "bar" "foo" "bar"; $)', err: { '0': [[[39,87],'parser/logical-category-repeated',{symbol:'foo'}]] } },
];

describe('parser, i/o', () => {
    cases.forEach(cc => {
        describeDB(cc.name, / \$t /.test(cc.src) ? cc.src : cc.src + TYPESPEC, dbt => {
            testErrorMap(dbt, () => dbt().parser.allErrors, cc.err);
            if (cc.tree) Object.keys(cc.tree).forEach(tr => {
                it(`parse for ${tr}`, () => {
                    let pars = dbt().scoper.lookup(tr).labelled.assertionParseTree;
                    expect(pars && pars.dump()).equal(cc.tree[tr]);
                });
            });
        });
    });
});

describeDB('parser getTemplate', LANG + TYPESPEC, dbt => {
    it('non-syntax-axiom has no template', () => expect(dbt().statement(0).parsingRule).to.equal(undefined));
    let rulet = () => dbt().scoper.lookup('w1').labelled.parsingRule;
    it('template has a type', () => expect(rulet().type).to.equal('wff'));
    it('template has an arity', () => expect(rulet().arity).to.equal(2));
    it('template has a slot list', () => expect(rulet().slots.length).to.equal(4));
    it('constant slot.lit', () => expect(rulet().slots[0].lit).to.equal('('));
    it('constant slot.index', () => expect(rulet().slots[0].index).to.equal(-1));
    it('variable slot.lit', () => expect(rulet().slots[1].lit).to.equal('ph'));
    it('variable slot.index', () => expect(rulet().slots[1].index).to.equal(0));
    it('variable slot.type', () => expect(rulet().slots[1].type).to.equal('wff'));
});
