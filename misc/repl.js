'use strict';
// node/io only
var rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
});

var mmom = require('../src/MMOM');
var Scoper = require('../src/Scoper');
var Verify = require('../src/Verify');

rl.setPrompt('smm> ');
rl.prompt();

var db;

function read_db(fname, cb) {
    function retry() {
        if (done) return;
        if (db = scanner.scan()) {
            done = true;
            cb();
        }
    }
    var done;
    var scanner = new mmom.Scanner(new mmom.ScanContext(fname, function (src) {
        require('fs').readFile(fname, 'utf8', function (err, text) {
            if (err) {
                src.failed = true;
                src.text = '';
                console.log(err);
            }
            else {
                src.text = text;
            }
            process.nextTick(retry);
        });
    }, false).initialZone(fname));
    process.nextTick(retry);
}

rl.on('line', function (l) {
    var match;
    if (match = /^read (.*)/.exec(l)) {
        console.log('reading',match[1]);
        rl.pause();
        read_db(match[1], function () {
            db.scanErrors.forEach(function(e) { console.log(e.toString()); });
            Scoper.install(db).errors.forEach(function(e) { console.log(e.toString()); });
            rl.prompt();
        });
    }
    else if (l === 'exit') {
        rl.close();
    }
    else if (match = /^lookup (.*)/.exec(l)) {
        if (!db) {
            console.log('no database');
        }
        else {
            console.log(Scoper.install(db).getSym(match[1]));
        }
        rl.prompt();
    }
    else if (match = /^verify ([0-9]+)/.exec(l)) {
        if (!db) {
            console.log('no database');
        }
        else if (+match[1] >= db.segments.length) {
            console.log('out of range');
        }
        else if (db.segments[+match[1]].type !== mmom.Segment.PROVABLE) {
            console.log('not a $p');
        }
        else {
            let err = Verify.install(db).verify(+match[1]);
            err.forEach(function(e) { console.log(e.toString()); });
        }
        rl.prompt();
    }
    else {
        console.log('unknown command');
        rl.prompt();
    }
});
