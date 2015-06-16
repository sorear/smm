var write = function (str) { process.stdout.write(str.toString(), 'utf8'); };

var MMOM = require('../src/MMOM.js');
require('../src/Scoper.js');
require('../src/Verifier.js');
require('../src/Parser.js');
require('../src/ConsoleErrorFormatter.js');

function time(why,f) {
    var time_1 = Date.now();
    f();
    var time_2 = Date.now();
    write(`${why} ${time_2 - time_1} ms\n`);
}

var db;

time('parse', function () {
    db = MMOM.parseSync(process.argv[2], function (s) { return require('fs').readFileSync(s, 'utf8'); });
    db.scanner.errors.forEach(function (e) { write(e.toConsoleString()); });
});
time('scope', function () {
    db.scoper.allErrors.forEach(function (errs, s) {
        errs.forEach(function (e) { write(e.toConsoleString()); });
    });
});
time('parser', function () {
    //db.parser._buildParser();
    db.parser.allErrors.forEach(function (errs, s) {
        errs.forEach(function (e) { write(e.toConsoleString()); });
    });
});
time('verify', function () {
    db.verifier.allErrors.forEach(function (errs, s) {
        errs.forEach(function (e) { write(e.toConsoleString()); });
    });
});
