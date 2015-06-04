var mmom = require('../src/MMOM.js');
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }
function err(db,i) { var e = db.scanErrors[i]; return e ? [ e.source.name, e.offset, e.category, e.code ] : []; }
function seg(db,i) { var e = db.segments[i]; return e ? [ e.type, e.raw, e.math, e.proof ] : []; }

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

describe('scan $c statement with embedded comment:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$c a $( x y z $) b $.'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is CONST segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.CONST); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    it('has math positions (length)', function () { expect(db.segments[0].mathPos.length).toBe(4); });
    it('has math positions (1)', function () { expect(db.segments[0].mathPos[1]).toBe(3); });
    it('has math positions (2)', function () { expect(db.segments[0].mathPos[3]).toBe(17); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan $d statement:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$d a b $.'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is DV segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.DV); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan $v statement:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$v a b $.'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is VAR segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.VAR); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan w/ Map argument:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',(new Map).set('afile','${')); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('scan w/ resolver argument:', function () {
    var db, name;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',function (src) { name = src.name; src.text = '${'; }); });
    it('resolver got expected result', function () { expect(name).toBe('afile'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('simple file inclusion:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',(new Map).set('afile','$[ bfile $]').set('bfile','$}')); });
    it('has two segments', function () { expect(db.segments.length).toBe(2); });
    it('first is include per se', function () { expect(db.segments[0].type).toBe(mmom.Segment.INCLUDE); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('$[ bfile $]'); });
    it('second is close', function () { expect(db.segments[1].type).toBe(mmom.Segment.CLOSE); });
    it('containing source', function () { expect(db.segments[1].raw).toBe('$}'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('inclusion of root file is ignored:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',(new Map).set('afile','$[ afile $]')); });
    it('has one segments', function () { expect(db.segments.length).toBe(1); });
    it('first is include per se', function () { expect(db.segments[0].type).toBe(mmom.Segment.INCLUDE); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('$[ afile $]'); });
    it('has no errors', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('inclusion of nonexistant file:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',(new Map).set('afile','$[ bfile $]')); });
    it('has one segments', function () { expect(db.segments.length).toBe(1); });
    it('first is include per se', function () { expect(db.segments[0].type).toBe(mmom.Segment.INCLUDE); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('$[ bfile $]'); });
    it('has one error', function () { expect(db.scanErrors.length).toBe(1); });
    it('failed-to-read error', function () { expect(err(db,0)).toEqual(['bfile',0,'scanner','failed-to-read']); });
});

describe('comment spanning include:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',(new Map).set('afile','$[ bfile $] text $)').set('bfile','$( comment')); });
    it('has 3 segments', function () { expect(db.segments.length).toBe(3); });
    it('first is include', function () { expect(seg(db,0)).toEqual([mmom.Segment.INCLUDE,'$[ bfile $]',null,null]); });
    it('second is comment fragment in an EOF', function () { expect(seg(db,1)).toEqual([mmom.Segment.EOF,'$( comment',null,null]); });
    it('third is trailing portion of wrapping file in an EOF', function () { expect(seg(db,2)).toEqual([mmom.Segment.EOF,' text $)',null,null]); });
    it('nonterminated comment error', function () { expect(err(db,0)).toEqual(['bfile',10,'scanner','eof-in-comment']); });
    it('loose $) error', function () { expect(err(db,1)).toEqual(['afile',17,'scanner','loose-comment-end']); });
    it('spurious label error', function () { expect(err(db,2)).toEqual(['afile',19,'scanner','spurious-label']); });
});

describe('nested comment:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$( foo $( bar $)'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is comment', function () { expect(seg(db,0)).toEqual([mmom.Segment.COMMENT,'$( foo $( bar $)',null,null]); });
    it('has one error', function () { expect(db.scanErrors.length).toBe(1); });
    it('nested comment error', function () { expect(err(db,0)).toEqual(['afile',7,'scanner','nested-comment']); });
});

describe('bad characters in comment:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$( \u001f \u007f $)'); });
    it('has 2 errors', function () { expect(db.scanErrors.length).toBe(2); });
    it('bad character (too low)', function () { expect(err(db,0)).toEqual(['afile',3,'scanner','bad-character']); });
    it('bad character (too high)', function () { expect(err(db,1)).toEqual(['afile',5,'scanner','bad-character']); });
});

describe('token with bad characters skipped', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$c a b\u001fc d $.'); });
    it('segment count', function () { expect(db.segments.length).toBe(1); });
    it('bad token skipped', function () { expect(seg(db,0)).toEqual([mmom.Segment.CONST,'$c a b\u001fc d $.',['a','d'],null]); });
    it('has 1 error', function () { expect(db.scanErrors.length).toBe(1); });
    it('bad character', function () { expect(err(db,0)).toEqual(['afile',5,'scanner','bad-character']); });
});

describe('not a nested comment:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$( x$( $a $q $)'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is comment', function () { expect(seg(db,0)).toEqual([mmom.Segment.COMMENT,'$( x$( $a $q $)',null,null]); });
    it('has no error', function () { expect(db.scanErrors.length).toBe(0); });
});

describe('false comment end:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$( x$)x $)'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is comment', function () { expect(seg(db,0)).toEqual([mmom.Segment.COMMENT,'$( x$)x $)',null,null]); });
    it('has 1 error', function () { expect(db.scanErrors.length).toBe(1); });
    it('false comment end', function () { expect(err(db,0)).toEqual(['afile',3,'scanner','pseudo-comment-end']); });
});

describe('unterminated directive:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$['); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is EOF (uninterpreted)', function () { expect(seg(db,0)).toEqual([mmom.Segment.EOF,'$[',null,null]); });
    it('has 1 error', function () { expect(db.scanErrors.length).toBe(1); });
    it('EOF in directive', function () { expect(err(db,0)).toEqual(['afile',2,'scanner','unterminated-directive']); });
});

describe('bad/missing filename:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$[ $foo $]'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is EOF (uninterpreted)', function () { expect(seg(db,0)).toEqual([mmom.Segment.EOF,'$[ $foo $]',null,null]); });
    it('has 2 errors', function () { expect(db.scanErrors.length).toBe(2); });
    it('bad filename', function () { expect(err(db,0)).toEqual(['afile',3,'scanner','dollar-in-filename']); });
    it('missing valid filename', function () { expect(err(db,1)).toEqual(['afile',8,'scanner','missing-filename']); });
});

describe('two tokens in include:', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile','$[ afile bfile $]'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is include (extra token ignored)', function () { expect(seg(db,0)).toEqual([mmom.Segment.INCLUDE,'$[ afile bfile $]',null,null]); });
    it('has 1 error', function () { expect(db.scanErrors.length).toBe(1); });
    it('bad filename', function () { expect(err(db,0)).toEqual(['afile',9,'scanner','directive-too-long']); });
});

describe('attempt to span file end with directive', function () {
    var db;
    beforeAll(function () { db = mmom.Scanner.parseSync('afile',new Map().set('afile','$[ bfile $] $]').set('bfile','$[ cfile')); });
    it('has three segments', function () { expect(db.segments.length).toBe(3); });
    it('first is include', function () { expect(seg(db,0)).toEqual([mmom.Segment.INCLUDE,'$[ bfile $]',null,null]); });
    it('second is uninterpretable', function () { expect(seg(db,1)).toEqual([mmom.Segment.EOF,'$[ cfile',null,null]); });
    it('third is uninterpretable', function () { expect(seg(db,2)).toEqual([mmom.Segment.EOF,' $]',null,null]); });
    it('has 2 errors', function () { expect(db.scanErrors.length).toBe(2); });
    it('unterminated directive', function () { expect(err(db,0)).toEqual(['bfile',8,'scanner','unterminated-directive']); });
    it('loose directive end', function () { expect(err(db,1)).toEqual(['afile',12,'scanner','loose-directive-end']); });
});
