var MMOM = require('../src/MMOM.js');
var expect = require('chai').expect;
require('../src/Scoper.js');
var db, errlist;
function src(x) {
    beforeAll(function () {
        db = MMOM.parseSync('afile',x);
        if (db.scanner.errors.length) throw new Error('unexpected scan errors in scoper pass');
        errlist = [];
        db.scoper.allErrors.forEach(function (el) { errlist.push.apply(errlist, el); });
    });
}
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }

function err(db,i) {
    var e = errlist[i];
    if (!e) return [];
    var o = [ e.location.source.name, e.location.from, e.category, e.code ];
    if (e.data && e.data.prev) o.push(e.data.prev.source.name, e.data.prev.from);
    return o;
}

function errs(es) {
    it(`has ${es.length} errors`, function () { expect(errlist.length).equal(es.length); });
    es.forEach(function (e,ix) {
        it(`error ${ix}: ${e[3]}`, function () { expect(err(db,ix)).eql(e); });
    });
}

var cases = [
    {
        name: 'empty file',
        src: '',
        errs: [],
    },
    {
        name: 'open and close',
        src: '${ $}',
        errs: [],
    },
    {
        name: 'unmatched open',
        src: '   ${',
        errs: [
            ['afile',3,'scope','never-closed'],
        ],
    },
    {
        name: 'unmatched close',
        src: ' $}',
        errs: [
            ['afile',1,'scope','close-stack-empty'],
        ],
    },
    {
        name: 'empty constant',
        src: ' $c $.',
        errs: [
            ['afile',1,'scope','const-empty'],
        ],
    },
    {
        name: 'constant not in top scope',
        src: '${ $c x $. $}',
        errs: [
            ['afile',3,'scope','const-not-top-scope'],
        ],
    },
    {
        name: 'constant after label',
        src: '$c x $. foo $a x $. $c foo $.',
        errs: [
            ['afile',23,'scope','label-then-const','afile',8],
        ],
    },
    {
        name: 'repeated constant',
        src: '$c x $. $c x $.',
        errs: [
            ['afile',11,'scope','math-then-const','afile',3],
        ],
    },
    {
        name: 'repetitive constant',
        src: '$c x x $.',
        errs: [
            ['afile',5,'scope','math-then-const','afile',3],
        ],
    },
    {
        name: 'non-repetitive constant',
        src: '$c x y $.',
        errs: [
        ],
    },
    {
        name: 'constant after var',
        src: '$v x $. $c x $.',
        errs: [
            ['afile',11,'scope','math-then-const','afile',3],
        ],
    },
    {
        name: 'constant after var (out of scope)',
        src: '${ $v x $. $} $c x $.',
        errs: [
            ['afile',17,'scope','math-then-const','afile',6],
        ],
    },
    {
        name: 'var empty',
        src: '$v $.',
        errs: [
            ['afile',0,'scope','var-empty'],
        ],
    },
    {
        name: 'var in scope legal',
        src: '${ $v x $. $}',
        errs: [],
    },
    {
        name: 'var after label',
        src: '$c x $. foo $a x $. $v foo $.',
        errs: [
            ['afile',23,'scope','label-then-var','afile',8],
        ],
    },
    {
        name: 'repeated variable',
        src: '$v x $. $v x $.',
        errs: [
            ['afile',11,'scope','math-then-var','afile',3],
        ],
    },
    {
        name: 'repeated variable (allowed with scope)',
        src: '${ $v x $. $} ${ $v x $. $}',
        errs: [],
    },
    {
        name: 'repetitive variable',
        src: '$v x x $.',
        errs: [
            ['afile',5,'scope','math-then-var','afile',3],
        ],
    },
    {
        name: 'non-repetitive variable',
        src: '$v x y $.',
        errs: [],
    },
    {
        name: 'var after const',
        src: '$c x $. $v x $.',
        errs: [
            ['afile',11,'scope','math-then-var','afile',3],
        ],
    },
    {
        name: '$e label after math',
        src: '$c x $. x $e x $.',
        errs: [
            ['afile',8,'scope','math-then-label','afile',3],
        ],
    },
    {
        name: '$e label used twice',
        src: '$c x $. y $a x $. y $e x $.',
        errs: [
            ['afile',18,'scope','label-used-twice','afile',8],
        ],
    },
    {
        name: '$e requires tokens',
        src: 'y $e $.',
        errs: [
            ['afile',0,'scope','eap-empty'],
        ],
    },
    {
        name: '$e requires valid const',
        src: 'y $e z $.',
        errs: [
            ['afile',5,'scope','eap-not-active-sym'],
        ],
    },
    {
        name: '$e checks all vars',
        src: 'y $e z w $.',
        errs: [
            ['afile',5,'scope','eap-not-active-sym'],
            ['afile',7,'scope','eap-not-active-sym'],
        ],
    },
    {
        name: '$e checks vars once',
        src: 'y $e z z $.',
        errs: [
            ['afile',5,'scope','eap-not-active-sym'],
        ],
    },
    {
        name: '$e requires active const',
        src: '${ $v z $. $} y $e z $.',
        errs: [
            ['afile',19,'scope','eap-not-active-sym'],
        ],
    },
    {
        name: '$e requires first be constant',
        src: '$c a $. $v b $. z $f a b $. y $e b $.',
        errs: [
            ['afile',33,'scope','eap-first-not-const'],
        ],
    },
    {
        name: '$e with two constants',
        src: '$c a $. $c b $. z $e a b $.',
        errs: [],
    },
    {
        name: '$e requires $f',
        src: '$c a $. $v b $. z $e a b $.',
        errs: [
            ['afile',23,'scope','eap-no-active-float'],
        ],
    },
    {
        name: '$e requires active $f',
        src: '$c a $. $v b $. ${ q $f a b $. $} z $e a b $.',
        errs: [
            ['afile',41,'scope','eap-no-active-float'],
        ],
    },
    {
        name: '$e with $f',
        src: '$c a $. $v b $. q $f a b $. z $e a b $.',
        errs: [],
    },
    {
        name: '$f label check',
        src: '$c a $. $v b c $. q $f a b $. q $f a c $.',
        errs: [
            ['afile',30,'scope','label-used-twice','afile',18],
        ],
    },
    {
        name: '$f length 1',
        src: 'q $f - $.',
        errs: [
            ['afile',0,'scope','float-format'],
        ],
    },
    {
        name: '$f length 3',
        src: 'q $f - - - $.',
        errs: [
            ['afile',0,'scope','float-format'],
        ],
    },
    {
        name: '$f requires const 1',
        src: '$v b $. z $f a b $.',
        errs: [
            ['afile',13,'scope','float-not-active-const'],
        ],
    },
    {
        name: '$f requires const 2',
        src: '$v a b $. z $f a b $.',
        errs: [
            ['afile',15,'scope','float-not-active-const'],
        ],
    },
    {
        name: '$f requires var 1',
        src: '$c a $. z $f a b $.',
        errs: [
            ['afile',15,'scope','float-not-active-var'],
        ],
    },
    {
        name: '$f requires var 2',
        src: '$c a b $. z $f a b $.',
        errs: [
            ['afile',17,'scope','float-not-active-var'],
        ],
    },
    {
        name: '$f requires var 3',
        src: '$c a $. ${ $v b $. $} z $f a b $.',
        errs: [
            ['afile',29,'scope','float-not-active-var'],
        ],
    },
    {
        name: '$f two use constant OK',
        src: '$c a $. $v b c $. y $f a b $. z $f a c $.',
        errs: [],
    },
    {
        name: '$f two use var not OK',
        src: '$c a $. $v b $. y $f a b $. z $f a b $.',
        errs: [
            ['afile',35,'scope','float-active-float','afile',16],
        ],
    },
    {
        name: '$d length',
        src: '$d x $.',
        errs: [
            ['afile',0,'scope','dv-short'],
        ],
    },
    {
        name: '$d repetitive',
        src: '$v x $. $d x x $.',
        errs: [
            ['afile',13,'scope','dv-repeated','afile',11],
        ],
    },
    {
        name: '$d repeat OK',
        src: '$v x y $. $d x y $. $d x y $.',
        errs: [],
    },
    {
        name: '$d requires var 1',
        src: '$v x $. $d x y $.',
        errs: [
            ['afile',13,'scope','dv-not-active-var'],
        ],
    },
    {
        name: '$d requires var 2',
        src: '$v x $. $c y $. $d x y $.',
        errs: [
            ['afile',21,'scope','dv-not-active-var'],
        ],
    },
    {
        name: '$d requires var 3',
        src: '$v x $. ${ $v y $. $} $d x y $.',
        errs: [
            ['afile',27,'scope','dv-not-active-var'],
        ],
    },
];

cases.forEach(function (cc) {
    describe(`${cc.name}:`, function () {
        src(cc.src);
        errs(cc.errs);
    });
});
