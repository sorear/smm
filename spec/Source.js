var mmom = require('../src/MMOM.js');

describe('mmom.Source', function () {
    it('has a name', function () { expect((new mmom.Source('a','b')).name).toBe('a'); });
    it('has source text', function () { expect((new mmom.Source('a','b')).text).toBe('b'); });
});
