import { parseSync } from './MMOM';

export function parseFileSync(name) {
    return parseSync(name, function (f) { return require('fs').readFileSync(f,'utf8'); });
}
