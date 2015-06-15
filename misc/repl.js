'use strict';
// node/io only
var rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
});

var MMOM = require('../src/MMOM');
require('../src/Scoper');
require('../src/Verifier');
var ConsoleErrorFormatter = require('../src/ConsoleErrorFormatter');

rl.setPrompt('smm> ');
rl.prompt();

var db;

rl.on('line', function (l) {
    var match;
    if (match = /^read (.*)/.exec(l)) {
        console.log('reading',match[1]);
        rl.pause();
        MMOM.parseAsync(match[1], function (fname) { return require('fs-promise').readFile(fname, 'utf8'); }).then(function (parsed) {
            db = parsed;
            console.log(ConsoleErrorFormatter(db.scanErrors)); //NOT API
            console.log(ConsoleErrorFormatter(db.scoper.errors)); //NOT API
            rl.prompt();
        }, function (err) { console.log('should not get here',err); });
    }
    else if (l === 'exit') {
        rl.close();
    }
    else if (match = /^lookup (.*)/.exec(l)) {
        if (!db) {
            console.log('no database');
        }
        else {
            console.log(Scoper.install(db).getSym(match[1])); //NOT API
        }
        rl.prompt();
    }
    else if (match = /^verify ([0-9]+)/.exec(l)) {
        if (!db) {
            console.log('no database');
        }
        else if (+match[1] >= db.statementCount) {
            console.log('out of range');
        }
        else if (db.statement(+match[1]).type !== MMOM.Statement.PROVABLE) {
            console.log('not a $p');
        }
        else {
            console.log(ConsoleErrorFormatter(db.verifier.errors(db.statement(+match[1])))); //NOT API
        }
        rl.prompt();
    }
    else {
        console.log('unknown command');
        rl.prompt();
    }
});
