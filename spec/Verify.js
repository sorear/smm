var mmom = require('../src/MMOM.js');
var Scoper = require('../src/Scoper.js');
var Verify = require('../src/Verify.js');
var db, vErr;
function src(x) {
    beforeAll(function () {
        db = mmom.Scanner.parseSync('afile',x);
        if (db.scanErrors.length) throw new Error('unexpected scan errors');
        vErr = Verify.install(db).verify( Scoper.install(db).getSym('test').labelled );
    });
}
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }

function err(i) {
    var e = vErr[i];
    if (!e) return [];
    var o = [ e.source.name, e.offset, e.category, e.code ];
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
];

cases.forEach(function (cc) {
    describe(`${cc.name}:`, function () {
        src(cc.src);
        errs(cc.errs);
    });
});
