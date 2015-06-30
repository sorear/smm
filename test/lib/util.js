import { MMOMErrorLocation, parseSync } from '../../lib/smm/mmom';
// describe, before, it are actually poked into the global scope by mocha >_>
import { expect } from 'chai';

export function renderErrorLocation(loc, how) {
    let result = [];
    if (how.filename) result.push(loc ? loc.source.name : null);
    result.push(loc ? loc.from : null);
    result.push(loc ? loc.to : null);
    return result;
}

export function renderError(error, how) {
    let erec = [];
    if (!error) return [];
    if (how.withStatement) erec.push((error.location && error.location.statement) ? (error.location.statement.label || error.location.statement.index) : null);
    erec.push(renderErrorLocation(error.location, how));
    erec.push(`${error.category}/${error.code}`);
    if (Object.keys(error.data).length) {
        let cookdat = {};
        Object.keys(error.data).sort().forEach(datakey => {
            let value = error.data[datakey];
            if (value instanceof MMOMErrorLocation)
                value = renderErrorLocation(value, how);
            cookdat[datakey] = value;
        });
        erec.push(cookdat);
    }
    return erec;
}

export function describeDB(name, src, callback, how = {}) {
    describe(`${name}:`, () => {
        let db;
        before(() => { db = parseSync('afile',src); });
        callback(() => db);
    });
}

export function flattenErrorMap(map) {
    let keys = [];
    map.forEach((list, key) => keys.push(key));
    let out = [];
    keys.sort((a,b) => a.index - b.index).forEach(key =>
            map.get(key).forEach(err => out.push(err)));
    return out;
}

export function testErrorList(label, thunk, list, how = {}) {
    list.forEach((errorDesc, index) => {
        it(`${label} error#${index}: ${errorDesc[1]}`, function () { expect(renderError(thunk()[index], how)).to.eql(errorDesc); });
    });
    it(`${label} has only ${list.length} errors`, function () { expect(thunk().slice(list.length).map(e => renderError(e, how))).eql([]); });
}

export function testErrorMap(dbThunk, mapThunk, obj, how = {}) {
    if (how.flat) {
        testErrorList('', () => flattenErrorMap(mapThunk()), obj, how);
        return;
    }

    Object.keys(obj).forEach(label => {
        testErrorList(
            label,
            () => mapThunk().get(/^\d+$/.test(label) ? dbThunk().statement(+label) : dbThunk().scoper.lookup(label).labelled) || [],
            obj[label],
            how
        );
    });

    it('has no other errors', () => {
        let spurious = [];
        mapThunk().forEach((list, stmt) => {
            let label = stmt.label || stmt.index;
            if (!obj[label]) spurious.push(label);
        });
        expect(spurious).to.eql([]);
    });
}
