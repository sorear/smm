var MMOM = require('../src/MMOM');
var expect = require('chai').expect;
require('../src/Parser');
var db,vErr;

function src(x) {
    before(function () {
        db = MMOM.parseSync('afile',x);
    });
}
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }

function ferr(e) {
    if (!e) return [];
    var o = [ e.location.source.name, e.location.from, e.category, e.code ];
    if (e.data && e.data.prev) o.push(e.data.prev.source.name, e.data.prev.from);
    return o;
}

function errs(lbl,es) {
    function get() { vErr = db.parser.errors( db.scoper.lookup(lbl).labelled ); }
    es.forEach(function (e,ix) {
        it(`error ${ix}: ${e[3]}`, function () { get(); expect(ferr(vErr[ix])).eql(e); });
    });
    it(`has only ${es.length} errors`, function () { get(); expect(vErr.slice(es.length).map(ferr)).eql([]); });
}
var LANG = '$c |- wff ( ) A $. $v ph ps $. f0 $f wff ph $. f1 $f wff ps $. w0 $a wff A $. w1 $a wff ( ph ps ) $. ';
var cases = [
    { name: '$f (ok)', src: '$c wff $.  $v ph $.  wph $f wff ph $.', err: { wph: [] } },
    { name: '$f (unknown)', src: '$c term $.  $v ph $.  wph $f term ph $.', err: { wph: [[ 'afile', 29, 'parser', 'float-not-syntax' ]] } },
    { name: '$f (not syntax)', src: '$c |- $.  $v ph $.  wph $f |- ph $.', err: { wph: [[ 'afile', 27, 'parser', 'float-not-syntax' ]] } },

    { name: 'invalid $a', src: 'wph $a $.', err: { } },
    { name: '$a/$e', src: '$c class |- wff X $. a0 $a wff class $. c0e $e |- class $. c0 $a class X $.', err: { c0: [[ 'afile', 59, 'parser', 'syntax-with-e' ]] } },
    { name: '$a/$d', src: '$c class X $. $v A B $. cA $f class A $. cB $f class B $. $d A B $. cX $a class X A B $.', err: { cX: [[ 'afile', 68, 'parser', 'syntax-with-dv' ]] } },
    { name: '$a/repeat', src: '$c class X $. $v A B $. cA $f class A $. cB $f class B $. cX $a class X A A $.', err: { cX: [[ 'afile', 74, 'parser', 'syntax-repeat-var', 'afile', 72]] } },
    { name: '$a/recurse 1', src: '$c class X $. $v A B $. cA $f class A $. cB $f class B $. cX $a class A X $.', err: { cX: [[ 'afile', 70, 'parser', 'syntax-left-recursive' ]] } },
    { name: '$a/recurse 2', src: '$c class set X $. $v A B $. cA $f class A $. cB $f set B $. cX $a class B $.', err: {} },

    { name: 'no role $e', src: '$c X $.  eX $e X $.', err: { eX: [[ 'afile', 15, 'parser', 'unconfigured-type' ]] } },
    { name: 'syntax $e', src: '$c wff X $.  eX $e wff X $.', err: { eX: [[ 'afile', 19, 'parser', 'essen-syntax' ]] } },
    { name: 'syntax $p ok', src: '$c wff X $.  eX $p wff X $= ? $.', err: { } },
    { name: 'ambiguous', src: '$c |- wff A $. wA1 $a wff A $. wA2 $a wff A $. ax $a |- A $.', err: { ax: [[ 'afile', 56, 'parser', 'ambiguous' ]] } },
    { name: 'no parse', src: LANG + 'test $a |- ( A ) $.', err: { test: [[ 'afile', 116, 'parser', 'parse-error' ]] } },
    { name: 'truncated', src: LANG + 'test $a |- ( A A $.', err: { test: [[ 'afile', 101, 'parser', 'truncated']] } },
    { name: 'valid', src: LANG + 'test $a |- ( A ( A A ) ) $.', err: { test: [] }, tree: { test: 'w1(w0(),w1(w0(),w0()))' } },
];

cases.forEach(function (cc) {
    describe(`${cc.name}:`, function () {
        src(cc.src);
        Object.keys(cc.err).forEach(function (ek) {
            errs(ek, cc.err[ek]);
        });
        if (cc.tree) Object.keys(cc.tree).forEach(function (tr) {
            it(`parse for ${tr}`, function () {
                var pars = db.parser.parseStatement(db.scoper.lookup(tr).labelled);
                expect(pars && pars.dump()).equal(cc.tree[tr]);
            });
        });
        it('has no other errors', function () { var o=[]; db.parser.allErrors.forEach(function(v,k){if(!k.label||!cc.err[k.label])o.push(k.label||k.index);}); expect(o).eql([]); });
    });
});
