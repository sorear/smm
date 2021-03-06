function write(str) { process.stdout.write(str.toString(), 'utf8'); };

import { parseSync } from '../lib/smm';

function time(why,f) {
    let time_1 = Date.now();
    f();
    let time_2 = Date.now();
    write(`${why} ${time_2 - time_1} ms\n`);
}

let db;

time('parse', () => {
    db = parseSync(process.argv[2], s => require('fs').readFileSync(s, 'utf8'));
    db.scanner.errors.forEach(e => write(e.toConsoleString()));
});
['scoper','metadata','parser','verifier'].forEach(stage => {
    time(stage, () => {
        db[stage].allErrors.forEach(errs => {
            errs.forEach(e => write(e.toConsoleString()));
        });
    });
});
