var MMOM = require('../lib/MMOM.js');
var expect = require('chai').expect;

describe('MMOM.Source:', function () {
    it('has a name', function () { expect((new MMOM.Source('a','b')).name).eql('a'); });
    it('has source text', function () { expect((new MMOM.Source('a','b')).text).eql('b'); });
    it('resolves end of file', function () { expect((new MMOM.Source('','').lookupPos(0))).eql([1,1]); });
    it('resolves with some text', function () { expect((new MMOM.Source('','abcdef').lookupPos(3))).eql([1,4]); });
    it('resolves before a newline', function () { expect((new MMOM.Source('','abc\ndef').lookupPos(3))).eql([1,4]); });
    it('resolves after a newline', function () { expect((new MMOM.Source('','abc\ndef').lookupPos(4))).eql([2,1]); });
    it('resolves after a CR', function () { expect((new MMOM.Source('','abc\rdef').lookupPos(4))).eql([2,1]); });
    it('resolves after a CRLF', function () { expect((new MMOM.Source('','abc\r\ndef').lookupPos(5))).eql([2,1]); });
    it('fetches line from end', function () { expect((new MMOM.Source('','abc\ndef')).getLine(2)).eql('def'); });
    it('fetches complete line', function () { expect((new MMOM.Source('','abc\ndef')).getLine(1)).eql('abc\n'); });
});
