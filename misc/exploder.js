import { parseSync } from '../lib/smm';
import mkdirp from 'mkdirp';
import * as path from 'path';
import * as fs from 'fs';

let db = parseSync(process.argv[2], s => fs.readFileSync(s, 'utf8'));

function leadingSpaces(string) {
    let i = 0;
    while (i < string.length && string.charCodeAt(i) <= 32) i++;
    return i;
}

let order = '';
function writeSpan(start, end) {
    if (start === end) return;
    let slugs = db.statement(start).outlineNode.path.map(n => n.slug);
    let name = slugs.pop();
    mkdirp.sync(path.join.apply(null, ['sections'].concat(slugs)));

    let text = '';
    for (let i = start; i < end; i++)
        text += db.statement(i).raw;

    // for prettiness and consistency with the perl version, attach whitespace before the section comment to the previous section
    if (start > 0) text = text.slice(leadingSpaces(text));
    if (end < db.statementCount) {
        let next = db.statement(end);
        text = text + next.raw.slice(0, leadingSpaces(next.raw));
    }

    let fname = path.join.apply(null, ['sections'].concat(slugs,name + '.mm'));
    fs.writeFileSync(fname, text, 'utf8');
    order += `$[ ${fname} $]\n`;
}

{
    let nodes = db.outlineNodes;
    let last = 0;
    for (let j = 0; j < nodes.length; j++) {
        writeSpan(last, nodes[j].statement.index);
        last = nodes[j].statement.index;
    }
    writeSpan(last, db.statementCount);
}

fs.writeFileSync('index.mm', order, 'utf8');
