var MMOM = require('../src/MMOM.js');
require('../src/Scoper.js');
require('../src/Verifier.js');
var db, vErr;
function src(x) {
    beforeAll(function () {
        db = MMOM.parseSync('afile',x);
        if (db.scanner.errors.length) throw new Error('unexpected scan errors');
        vErr = db.verifier.errors( db.scoper.lookup('test').labelled );
    });
}
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }

function err(i) {
    var e = vErr[i];
    if (!e) return [];
    var o = [ e.location.source.name, e.location.from, e.category, e.code ];
    if (e.data && e.data.prev) o.push(e.data.prev[0].name, e.data.prev[1]);
    return o;
}

function errs(es) {
    it(`has ${es.length} errors`, function () { expect(vErr.length).toBe(es.length); });
    es.forEach(function (e,ix) {
        it(`error ${ix}: ${e[3]}`, function () { expect(err(ix)).toEqual(e); });
    });
}

var cases = [
    { name: 'stub', src: '$c x $. test $p x $= ? $.', errs: [['afile',8,'verify','done-incomplete']] },
    { name: 'empty', src: '$c x $. test $p x $= $.', errs: [['afile',8,'verify','done-bad-stack-depth']] },
    { name: 'simplest valid', src: '$c x $. y $a x $. test $p x $= y $.', errs: [] },
    { name: 'stack depth', src: '$c x $. y $a x $. test $p x $= y y $.', errs: [['afile',18,'verify','done-bad-stack-depth']] },
    { name: 'type error', src: '$c x $. y $a x $. test $p z $= y $.', errs: [['afile',18,'verify','done-bad-type']] },
    { name: 'math error', src: '$c x $. y $a x $. test $p x z $= y $.', errs: [['afile',18,'verify','done-bad-math']] },
    { name: 'order error (a)', src: '$c x $. test $p x $= y $. y $a x $.', errs: [['afile',21,'verify','not-yet-proved']] },
    { name: 'self-reference error', src: '$c x $. test $p x $= test $.', errs: [['afile',21,'verify','not-yet-proved']] },
    { name: 'hypothesis', src: '$c x $. y $e x $. test $p x $= y $.', errs: [] },
    { name: 'hypothesis order', src: '$c x $. test $p x $= y $. y $e x $.', errs: [['afile',21,'verify','inactive-hyp']] },
    { name: 'hypothesis activity', src: '$c x $. ${ y $e x $. $} test $p x $= y $.', errs: [['afile',37,'verify','inactive-hyp']] },
    { name: 'w/arg $e', src: '$c x y $. ${ g $e x $. h $a y $. $} f $a x $. test $p y $= f h $.', errs: [] },
    { name: 'underflow', src: '$c x y $. ${ g $e x $. h $a y $. $} f $a x $. test $p y $= h $.', errs: [['afile',59,'verify','stack-underflow']] },
    { name: 'w/arg $f', src: '$c x y z $. $v 0 1 $. f $f x 0 $. g $a x y $. h $a x z 0 0 $. test $p x z y y $= g h $.', errs: [] },
    { name: '$e/$f order 1', src: '$c x y z w $. f $a w $. $v 0 $. g $a x y $. ${ h $f x 0 $. i $e w $. j $a x z 0 0 $. $} test $p x z y y $= g f j $.', errs: [] },
    { name: '$e/$f order 2', src: '$c x y z w $. f $a w $. $v 0 $. g $a x y $. ${ i $e w $. h $f x 0 $. j $a x z 0 0 $. $} test $p x z y y $= f g j $.', errs: [] },
    { name: '$d not ok', src: '$c x y z $. $v 0 1 $. f $f x 0 $. g $f x 1 $. ${ $d 0 1 $. h $a y 0 1 $. $} i $a x z $. test $p y 1 0 $= g f h $.', errs: [['afile',109,'verify','dv-violation']] },
    { name: '$d ok const', src: '$c x y z $. $v 0 1 $. f $f x 0 $. g $f x 1 $. ${ $d 0 1 $. h $a y 0 1 $. $} i $a x z $. test $p y 1 z $= g i h $.', errs: [] },
    { name: '$d ok pass', src: '$c x y z $. $v 0 1 $. f $f x 0 $. g $f x 1 $. ${ $d 0 1 $. h $a y 0 1 $. $} i $a x z $. ${ $d 0 1 $. test $p y 1 0 $= g f h $. $}', errs: [] },
    { name: '$d not ok eq', src: '$c x y z $. $v 0 1 $. f $f x 0 $. g $f x 1 $. ${ $d 0 1 $. h $a y 0 1 $. $} i $a x z $. ${ $d 0 1 $. test $p y 1 1 $= g g h $. $}', errs: [['afile',122,'verify','dv-violation']] },
    { name: 'simplest compressed', src: '$c x $. y $a x $. test $p x $= ( y ) A $.', errs: [] },
];

cases.forEach(function (cc) {
    describe(`${cc.name}:`, function () {
        src(cc.src);
        errs(cc.errs);
    });
});

describe('allErrors:', function () {
    beforeAll(function () { db = MMOM.parseSync('afile','$c x $. 1 $a x $. 2 $p x $= ? $. 3 $p x $= 1 $. 4 $p x $= ? $.'); });
    it('size', function () { expect(db.verifier.allErrors.size).toBe(2); });
    it('has 2', function () { expect(db.verifier.allErrors.get(db.statement(2)).length).toBe(1); });
    it('has 4', function () { expect(db.verifier.allErrors.get(db.statement(4)).length).toBe(1); });
    it('has not 3', function () { expect(db.verifier.allErrors.has(db.statement(3))).toBe(false); });
});
