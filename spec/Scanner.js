var mmom = require('../src/MMOM.js');

describe('scan empty database:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',''); });
    it('is a mmom.Database', function () { expect(db instanceof mmom.Database).toBe(true); });
    it('has no segments', function () { expect(db.segments.length).toBe(0); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan whitespace:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',' \t'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is EOF segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.EOF); });
    it('containing source', function () { expect(db.segments[0].raw).toBe(' \t'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan ${ token:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','${'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is OPEN segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.OPEN); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan ${ token with leading whitespace:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','\n\n${'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is OPEN segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.OPEN); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('\n\n${'); });
    it('has correct token position', function () { expect(db.segments[0].startPos[1]).toBe(2); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan ${ token with trailing whitespace:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','${\n\n'); });
    it('has two segments', function () { expect(db.segments.length).toBe(2); });
    it('is OPEN segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.OPEN); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    it('has correct token position', function () { expect(db.segments[0].startPos[1]).toBe(0); });
    it('is EOF segment', function () { expect(db.segments[1].type).toBe(mmom.Segment.EOF); });
    it('containing source', function () { expect(db.segments[1].raw).toBe('\n\n'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan $} token:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$}'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is CLOSE segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.CLOSE); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan $c statement:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$c a  b $.'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is CONST segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.CONST); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    it('has math positions (length)', function () { expect(db.segments[0].mathPos.length).toBe(4); });
    it('has math positions (1)', function () { expect(db.segments[0].mathPos[1]).toBe(3); });
    it('has math positions (2)', function () { expect(db.segments[0].mathPos[3]).toBe(6); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

