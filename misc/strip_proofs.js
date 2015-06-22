import { parseSync, MMOMStatement } from '../lib/MMOM';

let db = parseSync(process.argv[2], fn => require('fs').readFileSync(fn, 'utf8'));
for (let i = 0; i < db.statementCount; i++) {
    let stmt = db.statement(i);
    if (stmt.type === MMOMStatement.PROVABLE) {
        db.replaceProofString(stmt, ' ? ');
    }
}
process.stdout.write(db.text, 'utf8');
