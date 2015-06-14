(function () {

var write = function (str) { process.stdout.write(str.toString(), 'utf8'); };
var readfile = function (file) { return require('fs').readFileSync(file, 'utf8'); };
var filename = process.argv[2];

var MMOM = require('../src/MMOM.js');
var Scoper = require('../src/Scoper.js');
var Verify = require('../src/Verify.js');
var ConsoleErrorFormatter = require('../src/ConsoleErrorFormatter.js');

var time_1 = Date.now();
var db = MMOM.Scanner.parseSync( filename, function (s) { try { s.text = readfile(s.name); } catch(e) { s.text = ''; s.failed = e || 'false'; } });
var time_2 = Date.now();
write(`parse ${time_2 - time_1} ms\n`);
write(ConsoleErrorFormatter(db.scanErrors));
time_1 = Date.now();
Scoper.install(db);
time_2 = Date.now();
write(`scope ${time_2 - time_1}ms\n`);
write(ConsoleErrorFormatter(db.plugins.scoper.errors));
time_1 = Date.now();
var verifd = 0;
Verify.install(db);
db.statements.forEach(function (s,ix) {
    if (s.type === MMOM.Statement.PROVABLE) {
        verifd++;
        var err = Verify.install(db).verify(ix,false);
        if (err.length) write(`${s.label} ERR\n`);
        write(ConsoleErrorFormatter(err));
    }
});
time_2 = Date.now();
write(`verify ${verifd} $p ${time_2 - time_1}ms\n`);
})();
