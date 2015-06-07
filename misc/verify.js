var fs = require('fs');
var path = require('path');
var mmom = require('../src/MMOM.js');
var Scoper = require('../src/Scoper.js');
var time_1 = Date.now();
var db = mmom.Scanner.parseSync( path.basename(process.argv[2]), fs.readFileSync(process.argv[2],'utf8'));
var time_2 = Date.now();
process.stdout.write(`parse ${time_2 - time_1} ms\n`,'utf8');
db.scanErrors.forEach(function(e) {
    process.stdout.write(e.toString() + "\n", 'utf8');
});
time_1 = Date.now();
Scoper.install(db).scan();
time_2 = Date.now();
process.stdout.write(`scope ${time_2 - time_1} ms\n`,'utf8');
db.plugins.scoper.errors.forEach(function(e) {
    process.stdout.write(e.toString() + "\n", 'utf8');
});
