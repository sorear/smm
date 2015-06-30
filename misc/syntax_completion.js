import { parseSync } from '../lib/smm/mmom';
import '../lib/smm/parser';
import '../lib/smm/console-error-formatter';

if (!process.argv[2]) throw '1st arg must be a database';
let db = parseSync(process.argv[2], fn => require('fs').readFileSync(fn, 'utf8'));

db.scanner.errors.forEach(e => console.log(e.toConsoleString()));
//['scoper','parser'].forEach(stage => {
//    db[stage].allErrors.forEach(errs =>
//        errs.forEach(e => console.log(e.toConsoleString())));
//});

let rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: linePartial => {
        let toks = linePartial.split(/\s+/);
        if (toks.length > 1 && toks[0] === '') toks.shift();
        let partial = toks.pop();
        let r = db.parser.parseMathString('wff', db.statementCount, toks);
        if (r.error === 'no-parse' && r.edata.highwater === toks.length) {
            let direct = new Set();
            let indirect = new Set();
            r.edata.highwater_list.forEach(hwt => {
                if (hwt[0] === '$') {
                    let ord = db.parser._order.indexOf(hwt.slice(1));
                    db.parser._initial[ord].forEach(t => indirect.add(t));
                }
                else {
                    direct.add(hwt);
                }
            });
            direct.forEach(t => indirect.delete(t));
            let groups = [];
            [indirect, direct].forEach(pool => {
                let group = [];
                pool.forEach(tkn => { if (tkn.startsWith(partial)) group.push(tkn); });
                group.sort();
                if (group.length) {
                    if (groups.length) groups.push('');
                    group.forEach(t => groups.push(t + ' '));
                }
            });
            return [groups, partial];
        }
        else {
            return [[], partial];
        }
    },
});

rl.setPrompt('Complete a math string> ');
rl.prompt();
rl.resume();
rl.on('line', x => { rl.prompt(); });
