var MMOM = require('../lib/MMOM.js');
var expect = require('chai').expect;
var db;
function src(x) {
    if (typeof x === 'object' && !(x instanceof Map)) { x = new Map(Object.keys(x).map(function (k) { return [k,x[k]]; })); }
    before(function () { db = MMOM.parseSync('afile',x); });
}
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }
function err(db,i) { var e = db.scanner.errors[i]; return e ? [ e.location.source.name, e.location.from, e.category, e.code ] : []; }
function seg(db,i) { var e = db.statements[i]; return e ? [ e.type, e.raw, e.math, e.proof ] : []; }
function seg2(db,i) { var e = db.statements[i]; return e ? [ e.type, e.raw, e.math, e.proof, e.label ] : []; }
function pos(db,i,s) { return db.statements[i][s].map(function (v,ix) { return ix%2 ? v : v.name; }); }
function errs(es) {
    it(`has ${es.length} errors`, function () { expect(db.scanner.errors.length).equal(es.length); });
    es.forEach(function (e,ix) {
        it(`error ${ix}: ${e[3]}`, function () { expect(err(db,ix)).eql(e); });
    });
}

function segs(ss) {
    it(`has ${ss.length} statements`, function () { expect(db.statements.length).equal(ss.length); });
    ss.forEach(function (s,ix) {
        it(`statement ${ix}=${s.typ}`, function () { expect(seg2(db,ix)).eql([MMOM.Statement[s.typ],s.raw,s.mat,s.prf,s.lbl]); });
        if (s.stp) { it(`statement ${ix}/startPos`, function () { expect(pos(db,ix,'startPos')).eql(s.stp); }); }
        if (s.map) { it(`statement ${ix}/mathPos`, function () { expect(pos(db,ix,'mathPos')).eql(s.map); }); }
        if (s.prp) { it(`statement ${ix}/proofPos`, function () { expect(pos(db,ix,'proofPos')).eql(s.prp); }); }
    });
}

describe('scan empty database:', function () {
    src('')
    it('is a MMOM.Database', function () { expect(db instanceof MMOM.Database).equal(true); });
    it('has no statements', function () { expect(db.statements.length).equal(0); });
    errs([]);
});

describe('scan whitespace:', function () {
    src(' \t')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is EOF statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.EOF); });
    it('containing source', function () { expect(db.statements[0].raw).equal(' \t'); });
    errs([]);
});

describe('scan ${ token:', function () {
    src('${')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is OPEN statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.OPEN); });
    it('containing source', function () { expect(db.statements[0].raw).equal('${'); });
    errs([]);
});

describe('scan two tokens for linking:', function () {
    src('${ ${')
    it('has two statements', function () { expect(db.statements.length).equal(2); });
    it('first linked to database', function () { expect(db.statements[0].database).equal(db); });
    it('first linked to index', function () { expect(db.statements[0].index).equal(0); });
    it('second linked to database', function () { expect(db.statements[1].database).equal(db); });
    it('second linked to index', function () { expect(db.statements[1].index).equal(1); });
});

describe('scan ${ token with leading whitespace:', function () {
    src('\n\n${')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is OPEN statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.OPEN); });
    it('containing source', function () { expect(db.statements[0].raw).equal('\n\n${'); });
    it('has correct token position', function () { expect(db.statements[0].startPos[1]).equal(2); });
    errs([]);
});

describe('scan ${ token with trailing whitespace:', function () {
    src('${\n\n')
    it('has two statements', function () { expect(db.statements.length).equal(2); });
    it('is OPEN statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.OPEN); });
    it('containing source', function () { expect(db.statements[0].raw).equal('${'); });
    it('has correct token position', function () { expect(db.statements[0].startPos[1]).equal(0); });
    it('is EOF statement', function () { expect(db.statements[1].type).equal(MMOM.Statement.EOF); });
    it('containing source', function () { expect(db.statements[1].raw).equal('\n\n'); });
    errs([]);
});

describe('scan $} token:', function () {
    src('$}')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is CLOSE statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.CLOSE); });
    errs([]);
});

describe('scan $c statement:', function () {
    src('$c a  b $.')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is CONSTANT statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.CONSTANT); });
    it('has math string', function () { expect(db.statements[0].math).eql(['a','b']); });
    it('has math positions (length)', function () { expect(db.statements[0].mathPos.length).equal(4); });
    it('has math positions (1)', function () { expect(db.statements[0].mathPos[1]).equal(3); });
    it('has math positions (2)', function () { expect(db.statements[0].mathPos[3]).equal(6); });
    errs([]);
});

describe('scan $c statement with embedded comment:', function () {
    src('$c a $( x y z $) b $.')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is CONSTANT statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.CONSTANT); });
    it('has math string', function () { expect(db.statements[0].math).eql(['a','b']); });
    it('has math positions (length)', function () { expect(db.statements[0].mathPos.length).equal(4); });
    it('has math positions (1)', function () { expect(db.statements[0].mathPos[1]).equal(3); });
    it('has math positions (2)', function () { expect(db.statements[0].mathPos[3]).equal(17); });
    errs([]);
});

describe('scan $d statement:', function () {
    src('$d a b $.')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is DISJOINT statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.DISJOINT); });
    it('has math string', function () { expect(db.statements[0].math).eql(['a','b']); });
    errs([]);
});

describe('scan $v statement:', function () {
    src('$v a b $.')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('is VARIABLE statement', function () { expect(db.statements[0].type).equal(MMOM.Statement.VARIABLE); });
    it('has math string', function () { expect(db.statements[0].math).eql(['a','b']); });
    errs([]);
});

describe('scan w/ Map argument:', function () {
    src((new Map).set('afile','${'))
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('containing source', function () { expect(db.statements[0].raw).equal('${'); });
    errs([]);
});

describe('scan w/ resolver argument:', function () {
    var name;
    src(function (src) { name = src; return '${'; })
    it('resolver got expected result', function () { expect(name).equal('afile'); });
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('containing source', function () { expect(db.statements[0].raw).equal('${'); });
    errs([]);
});

describe('simple file inclusion:', function () {
    src((new Map).set('afile','$[ bfile $]').set('bfile','$}'))
    it('has two statements', function () { expect(db.statements.length).equal(2); });
    it('first is include per se', function () { expect(db.statements[0].type).equal(MMOM.Statement.INCLUDE); });
    it('containing source', function () { expect(db.statements[0].raw).equal('$[ bfile $]'); });
    it('second is close', function () { expect(db.statements[1].type).equal(MMOM.Statement.CLOSE); });
    it('containing source', function () { expect(db.statements[1].raw).equal('$}'); });
    errs([]);
});

describe('inclusion of root file is ignored:', function () {
    src((new Map).set('afile','$[ afile $]'))
    it('has one statements', function () { expect(db.statements.length).equal(1); });
    it('first is include per se', function () { expect(db.statements[0].type).equal(MMOM.Statement.INCLUDE); });
    it('containing source', function () { expect(db.statements[0].raw).equal('$[ afile $]'); });
    errs([]);
});

describe('inclusion of nonexistant file:', function () {
    src((new Map).set('afile','$[ bfile $]'))
    it('has one statements', function () { expect(db.statements.length).equal(1); });
    it('first is include per se', function () { expect(db.statements[0].type).equal(MMOM.Statement.INCLUDE); });
    it('containing source', function () { expect(db.statements[0].raw).equal('$[ bfile $]'); });
    errs([['bfile',0,'scanner','failed-to-read']]);
});

describe('comment spanning include:', function () {
    src((new Map).set('afile','$[ bfile $] text $)').set('bfile','$( comment'))
    it('has 3 statements', function () { expect(db.statements.length).equal(3); });
    it('first is include', function () { expect(seg(db,0)).eql([MMOM.Statement.INCLUDE,'$[ bfile $]',null,null]); });
    it('second is comment fragment in an EOF', function () { expect(seg(db,1)).eql([MMOM.Statement.EOF,'$( comment',null,null]); });
    it('third is trailing portion of wrapping file in an EOF', function () { expect(seg(db,2)).eql([MMOM.Statement.EOF,' text $)',null,null]); });
    it('nonterminated comment error', function () { expect(err(db,0)).eql(['bfile',10,'scanner','eof-in-comment']); });
    it('loose $) error', function () { expect(err(db,1)).eql(['afile',17,'scanner','loose-comment-end']); });
    it('spurious label error', function () { expect(err(db,2)).eql(['afile',19,'scanner','spurious-label']); });
});

describe('nested comment:', function () {
    src('$( foo $( bar $)')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('first is comment', function () { expect(seg(db,0)).eql([MMOM.Statement.COMMENT,'$( foo $( bar $)',null,null]); });
    errs([['afile',7,'scanner','pseudo-nested-comment']]);
});

describe('bad characters in comment:', function () {
    src('$( \u001f \u007f $)')
    errs([
        ['afile',3,'scanner','bad-character'],
        ['afile',5,'scanner','bad-character'],
    ]);
});

describe('token with bad characters skipped', function () {
    src('$c a b\u001fc d $.')
    it('statement count', function () { expect(db.statements.length).equal(1); });
    it('bad token skipped', function () { expect(seg(db,0)).eql([MMOM.Statement.CONSTANT,'$c a b\u001fc d $.',['a','d'],null]); });
    errs([ ['afile',5,'scanner','bad-character'] ]);
});

describe('not a nested comment:', function () {
    src('$( x$( $a $q $)')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('first is comment', function () { expect(seg(db,0)).eql([MMOM.Statement.COMMENT,'$( x$( $a $q $)',null,null]); });
    errs([['afile',3,'scanner','pseudo-nested-comment']]);
});

describe('false comment end:', function () {
    src('$( x$)x $)')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('first is comment', function () { expect(seg(db,0)).eql([MMOM.Statement.COMMENT,'$( x$)x $)',null,null]); });
    errs([ ['afile',3,'scanner','pseudo-comment-end'] ]);
});

describe('unterminated directive:', function () {
    src('$[')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('first is EOF (uninterpreted)', function () { expect(seg(db,0)).eql([MMOM.Statement.EOF,'$[',null,null]); });
    errs([ ['afile',2,'scanner','unterminated-directive'] ]);
});

describe('bad/missing filename:', function () {
    src('$[ $foo $]')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('first is EOF (uninterpreted)', function () { expect(seg(db,0)).eql([MMOM.Statement.EOF,'$[ $foo $]',null,null]); });
    errs([
        ['afile',3,'scanner','dollar-in-filename'],
        ['afile',8,'scanner','missing-filename'],
    ]);
});

describe('two tokens in include:', function () {
    src('$[ afile bfile $]')
    it('has one statement', function () { expect(db.statements.length).equal(1); });
    it('first is include (extra token ignored)', function () { expect(seg(db,0)).eql([MMOM.Statement.INCLUDE,'$[ afile bfile $]',null,null]); });
    errs([['afile',9,'scanner','directive-too-long']]);
});

describe('attempt to span file end with directive:', function () {
    src(new Map().set('afile','$[ bfile $] $]').set('bfile','$[ cfile'))
    it('has three statements', function () { expect(db.statements.length).equal(3); });
    it('first is include', function () { expect(seg(db,0)).eql([MMOM.Statement.INCLUDE,'$[ bfile $]',null,null]); });
    it('second is uninterpretable', function () { expect(seg(db,1)).eql([MMOM.Statement.EOF,'$[ cfile',null,null]); });
    it('third is uninterpretable', function () { expect(seg(db,2)).eql([MMOM.Statement.EOF,' $]',null,null]); });
    errs([
        ['bfile',8,'scanner','unterminated-directive'],
        ['afile',12,'scanner','loose-directive-end'],
    ]);
});

describe('missing proof:', function () {
    src('foo $p x y $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $p', function () { expect(seg2(db,0)).eql([MMOM.Statement.PROVABLE,'foo $p x y $.',['x','y'],[],'foo']); });
    errs([ ['afile',11,'scanner','missing-proof'] ]);
});

describe('valid $p statement:', function () {
    src('   foo $p x y $= z $( k $) w $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $p', function () { expect(seg2(db,0)).eql([MMOM.Statement.PROVABLE,'   foo $p x y $= z $( k $) w $.',['x','y'],['z','w'],'foo']); });
    it('label position', function () { expect(pos(db,0,'startPos')).eql(['afile',3]); });
    it('math positions', function () { expect(pos(db,0,'mathPos')).eql(['afile',10,'afile',12]); });
    it('proof positions', function () { expect(pos(db,0,'proofPos')).eql(['afile',17,'afile',27]); });
    errs([]);
});

describe('valid $a statement:', function () {
    src('   foo $a x y $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $a', function () { expect(seg2(db,0)).eql([MMOM.Statement.AXIOM,'   foo $a x y $.',['x','y'],null,'foo']); });
    it('label position', function () { expect(pos(db,0,'startPos')).eql(['afile',3]); });
    it('math positions', function () { expect(pos(db,0,'mathPos')).eql(['afile',10,'afile',12]); });
    errs([]);
});

describe('valid $e statement:', function () {
    src('   foo $e x y $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $e', function () { expect(seg2(db,0)).eql([MMOM.Statement.ESSENTIAL,'   foo $e x y $.',['x','y'],null,'foo']); });
    errs([]);
});

describe('valid $f statement:', function () {
    src('   foo $f x y $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $f', function () { expect(seg2(db,0)).eql([MMOM.Statement.FLOATING,'   foo $f x y $.',['x','y'],null,'foo']); });
    errs([]);
});

describe('spurious proof:', function () {
    src('   foo $f x y $= z $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $f', function () { expect(seg2(db,0)).eql([MMOM.Statement.BOGUS,'   foo $f x y $= z $.',['x','y','z'],null,'foo']); });
    errs([['afile',14,'scanner','spurious-proof']]);
});

describe('spurious proof 2:', function () {
    src('   foo $p x $= y $= z $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is discarded', function () { expect(seg2(db,0)).eql([MMOM.Statement.BOGUS,'   foo $p x $= y $= z $.',['x'],['y','z'],'foo']); });
    errs([ ['afile',17,'scanner','spurious-proof'] ]);
});

describe('stray $. w/o label:', function () {
    src('$.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $f', function () { expect(seg2(db,0)).eql([MMOM.Statement.BOGUS,'$.',null,null,null]); });
    errs([ ['afile',0,'scanner','spurious-period'] ]);
});

describe('stray $. w/ label:', function () {
    src('foo $.')
    it('has 1 statements', function () { expect(db.statements.length).equal(1); });
    it('first is $f', function () { expect(seg2(db,0)).eql([MMOM.Statement.BOGUS,'foo $.',null,null,'foo']); });
    errs([ ['afile',4,'scanner','spurious-period'] ]);
});

var cases = [
    {
        tag: "mid-statement file switch",
        src: { "afile": "$c a $[ bfile $] c $.", "bfile": "b $( sss $)" },
        seg: [
            { typ: 'CONSTANT', raw: "$c a $[ bfile $]b $( sss $) c $.", mat: ['a','b','c'], prf: null, lbl: null, map: ['afile',3,'bfile',0,'afile',17] },
        ],
        err: []
    },
    {
        tag: "missing $. on math",
        src: 'foo $a x y $c z $.',
        seg: [
            { typ: 'AXIOM', raw: 'foo $a x y', mat: ['x','y'], lbl: 'foo', prf: null },
            { typ: 'CONSTANT', raw: ' $c z $.', mat: ['z'], lbl: null, prf: null },
        ],
        err: [['afile',11,'scanner','nonterminated-math']],
    },
    {
        tag: "missing $. on math/$p",
        src: 'foo $p x y $c z $.',
        seg: [
            { typ: 'PROVABLE', raw: 'foo $p x y', mat: ['x','y'], lbl: 'foo', prf: [] },
            { typ: 'CONSTANT', raw: ' $c z $.', mat: ['z'], lbl: null, prf: null },
        ],
        err: [['afile',11,'scanner','nonterminated-math']],
    },
    {
        tag: "missing $. on proof",
        src: 'foo $p x y $= w $c z $.',
        seg: [
            { typ: 'PROVABLE', raw: 'foo $p x y $= w', mat: ['x','y'], lbl: 'foo', prf: ['w'] },
            { typ: 'CONSTANT', raw: ' $c z $.', mat: ['z'], lbl: null, prf: null },
        ],
        err: [['afile',16,'scanner','nonterminated-proof']],
    },
    {
        tag: "missing label on $a->BOGUS",
        src: '$a x y $.',
        seg: [
            { typ: 'BOGUS', raw: '$a x y $.', mat: ['x','y'], lbl: null, prf: null },
        ],
        err: [['afile',0,'scanner','missing-label']],
    },
    {
        tag: "missing label on $p incomplete->BOGUS",
        src: '$p x y $.',
        seg: [
            { typ: 'BOGUS', raw: '$p x y $.', mat: ['x','y'], lbl: null, prf: [] },
        ],
        err: [['afile',0,'scanner','missing-label']],
    },
    {
        tag: "missing label on $p complete->BOGUS",
        src: '$p x y $= z $.',
        seg: [
            { typ: 'BOGUS', raw: '$p x y $= z $.', mat: ['x','y'], lbl: null, prf: ['z'] },
        ],
        err: [['afile',0,'scanner','missing-label']],
    },
    {
        tag: "spurious label",
        src: 'foo ${',
        seg: [
            { typ: 'OPEN', raw: 'foo ${', mat: null, lbl: null, prf: null },
        ],
        err: [['afile',4,'scanner','spurious-label']],
    },
    {
        tag: "keyword-like entity",
        src: '$x $}',
        seg: [
            { typ: 'CLOSE', raw: '$x $}', mat: null, lbl: null, prf: null },
        ],
        err: [['afile',0,'scanner','pseudo-keyword']],
    },
    {
        tag: "limited label charset",
        src: '?? $a x y $.',
        seg: [
            { typ: 'AXIOM', raw: '?? $a x y $.', mat: ['x','y'], lbl: '??', prf: null },
        ],
        err: [['afile',0,'scanner','invalid-label']],
    },
    {
        tag: "two labels",
        src: 'foo bar $a x y $.',
        seg: [
            { typ: 'AXIOM', raw: 'foo bar $a x y $.', mat: ['x','y'], lbl: 'bar', prf: null, stp: ['afile',0] }, // second label, but start position is the start
        ],
        err: [['afile',4,'scanner','duplicate-label']],
    },
];

cases.forEach(function(c) {
    describe(`${c.tag}: `, function () {
        src(c.src);
        segs(c.seg);
        errs(c.err);
    });
});
