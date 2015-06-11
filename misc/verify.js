(function () {
var isNode, isD8, write, readfile, filename, mmom, Scoper, Verify;

try {
    if (typeof readbuffer === 'function' && typeof version === 'function') isD8 = true;
} catch (e) {}
try {
    if ('node' in process.versions) isNode = true;
} catch (e) {}

if (isNode) {
    write = function (str) { process.stdout.write(str.toString(), 'utf8'); };
    readfile = function (file) { return require('fs').readFileSync(file, 'utf8'); };
    filename = process.argv[2];

    mmom = require('../src/MMOM.js');
    Scoper = require('../src/Scoper.js');
    Verify = require('../src/Verify.js');
}
else if (isD8) {
    filename = Realm.global(0).arguments[0];
    readfile = Realm.global(0).read;
    write = Realm.global(0).write;
    define = function (a,b) { mmom = b(); };
    load('src/MMOM.js');
    define = function (a,b) { Scoper = b(mmom); };
    load('src/Scoper.js');
    var ABRStringStore, BigInt;
    define = function (b) { var m={}; b(null,null,m); BigInt = m.exports; };
    load('node_modules/BigInt/src/BigInt.js');
    define = function (a,b) { ABRStringStore = b(BigInt); };
    load('src/ABRStringStore.js');
    define = function (a,b) { Verify = b(mmom,ABRStringStore,Scoper); };
    load('src/Verify.js');
}

var time_1 = Date.now();
var db = mmom.Scanner.parseSync( filename, function (s) { try { s.text = readfile(s.name); } catch(e) { write(e); s.text = ''; s.failed = true; } });
var time_2 = Date.now();
write(`parse ${time_2 - time_1} ms\n`);
db.scanErrors.forEach(function(e) {
    write(e.toString() + "\n");
});
time_1 = Date.now();
Scoper.install(db);
time_2 = Date.now();
write(`scope ${time_2 - time_1}ms\n`);
db.plugins.scoper.errors.forEach(function(e) {
    write(e.toString() + "\n");
});
time_1 = Date.now();
var verifd = 0;
Verify.install(db);
db.segments.forEach(function (s,ix) {
    if (s.type === mmom.Segment.PROVABLE) {
        verifd++;
        var err = Verify.install(db).verify(ix,false);
        if (err.length) write(`${s.label} ERR\n`);
        err.forEach(function (e) {
            write(e.toString() + "\n");
        });
    }
});
time_2 = Date.now();
write(`verify ${verifd} $p ${time_2 - time_1}ms\n`);
})();
