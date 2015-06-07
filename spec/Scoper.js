var mmom = require('../src/MMOM.js');
var Scoper = require('../src/Scoper.js');
var db;
function src(x) {
    beforeAll(function () {
        db = mmom.Scanner.parseSync('afile',x);
        if (db.scanErrors.length) throw new Error('unexpected scan errors in scoper pass');
        Scoper.install(db).scan();
    });
}
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }

function err(db,i) {
    var e = db.plugins.scoper.errors[i];
    if (!e) return [];
    var o = [ e.source.name, e.offset, e.category, e.code ];
    if (e.data && e.data.prev) o.push(e.data.prev[0].name, e.data.prev[1]);
    return o;
}

function errs(es) {
    it(`has ${es.length} errors`, function () { expect(db.plugins.scoper.errors.length).toBe(es.length); });
    es.forEach(function (e,ix) {
        it(`error ${ix}: ${e[3]}`, function () { expect(err(db,ix)).toEqual(e); });
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
];

cases.forEach(function (cc) {
    describe(`${cc.name}: `, function () {
        src(cc.src);
        errs(cc.errs);
    });
});
