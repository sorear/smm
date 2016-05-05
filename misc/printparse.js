import { parseSync } from '../lib/smm/mmom';
import '../lib/smm/parser';
import '../lib/smm/console-error-formatter';

if (!process.argv[2]) throw '1st arg must be a database';
let db = parseSync(process.argv[2], fn => require('fs').readFileSync(fn, 'utf8'));

function print(slots, map, node) {
    var out = '';
    node.children.forEach(ch => out += print(slots,map,ch));
    var lbl = node.syntax_axiom.label;
    switch (lbl) {
        case 'wa': case 'wi': case 'wal': case 'wex': case 'wn': case 'wo': case 'wb':
            return out + lbl + '(); ';
        case 'cv': return out;
        case 'wceq': case 'wcel':
            return out + lbl.replace('c','') + '(); ';
        case 'wph': case 'wps': case 'vx': case 'vy': case 'vz': case 'vw': case 'vu': case 'vt': case 'vv':
            if (!map[lbl]) {
                if (!slots.length) throw 'out of slots';
                map[lbl] = slots.shift();
            }
            return out + map[lbl] + '(); ';
        default:
                throw 'unhandled: '+lbl;
    }
}

console.log(print(['vA','vB','vC','vD','vE','vF','vG'],{},db.statementByLabel(process.argv[3]).assertionParseTree));
