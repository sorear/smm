var requirejs = require('requirejs').config({ nodeRequire: require, baseUrl: require('path').resolve(__dirname, '../src') });
var abr = requirejs('ABRStringStore');

describe('The constant-weight iteration', function () {
    it('takes 1 to 2', function() { expect(abr._nextSameWeight(1)).toBe(2); });
    it('takes 2 to 4', function() { expect(abr._nextSameWeight(2)).toBe(4); });
    it('takes 3 to 5', function() { expect(abr._nextSameWeight(3)).toBe(5); });
    it('finds 35 3-out-of-7 codes', function() {
        var t = [], i;
        for (i = 0x07; i <= 0x70; i = abr._nextSameWeight(i)) t.push(i);
        expect(t.length).toBe(35);
    });
    it('wraps at bit 30 correctly', function() { expect(abr._nextSameWeight(0x30000000)).toBe(0x40000001); });
    it('works up to the max', function() { expect(abr._nextSameWeight(0x7FFFFFFD)).toBe(0x7FFFFFFE); });
});
