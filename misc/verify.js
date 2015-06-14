var write = function (str) { process.stdout.write(str.toString(), 'utf8'); };

var MMOM = require('../src/MMOM.js');
var Scoper = require('../src/Scoper.js');
var Verify = require('../src/Verify.js');
var ConsoleErrorFormatter = require('../src/ConsoleErrorFormatter.js');

function time(why,f) {
    var time_1 = Date.now();
    f();
    var time_2 = Date.now();
    write(`${why} ${time_2 - time_1} ms\n`);
}

var db;

time('parse', function () { db = MMOM.parseSync(process.argv[2], function (s) { return require('fs').readFileSync(s, 'utf8'); }); });
write(ConsoleErrorFormatter(db.scanErrors));
time('scope', function () { Scoper.install(db); });
write(ConsoleErrorFormatter(db.plugins.scoper.errors));
time('verify', function () {
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
    write(`${verifd} $p\n`);
});
