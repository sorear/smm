var MMOM = require('../src/MMOM.js');

describe('MMOM.Source:', function () {
    it('has a name', function () { expect((new MMOM.Source('a','b')).name).toEqual('a'); });
    it('has source text', function () { expect((new MMOM.Source('a','b')).text).toEqual('b'); });
    it('resolves end of file', function () { expect((new MMOM.Source('','').lookupPos(0))).toEqual([1,1]); });
    it('resolves with some text', function () { expect((new MMOM.Source('','abcdef').lookupPos(3))).toEqual([1,4]); });
    it('resolves before a newline', function () { expect((new MMOM.Source('','abc\ndef').lookupPos(3))).toEqual([1,4]); });
    it('resolves after a newline', function () { expect((new MMOM.Source('','abc\ndef').lookupPos(4))).toEqual([2,1]); });
    it('resolves after a CR', function () { expect((new MMOM.Source('','abc\rdef').lookupPos(4))).toEqual([2,1]); });
    it('resolves after a CRLF', function () { expect((new MMOM.Source('','abc\r\ndef').lookupPos(5))).toEqual([2,1]); });
    it('fetches line from end', function () { expect((new MMOM.Source('','abc\ndef')).getLine(2)).toEqual('def'); });
    it('fetches complete line', function () { expect((new MMOM.Source('','abc\ndef')).getLine(1)).toEqual('abc\n'); });
});
