var requirejs = require('requirejs').config({ nodeRequire: require, baseUrl: require('path').resolve(__dirname, '../src') });
var ABRStringStore = requirejs('ABRStringStore');

describe('The constant-weight iteration', function () {
    it('takes 1 to 2', function() { expect(ABRStringStore._nextSameWeight(1)).toBe(2); });
    it('takes 2 to 4', function() { expect(ABRStringStore._nextSameWeight(2)).toBe(4); });
    it('takes 3 to 5', function() { expect(ABRStringStore._nextSameWeight(3)).toBe(5); });
    it('finds 35 3-out-of-7 codes', function() {
        var t = [], i;
        for (i = 0x07; i <= 0x70; i = ABRStringStore._nextSameWeight(i)) t.push(i);
        expect(t.length).toBe(35);
    });
    it('wraps at bit 30 correctly', function() { expect(ABRStringStore._nextSameWeight(0x30000000)).toBe(0x40000001); });
    it('works up to the max', function() { expect(ABRStringStore._nextSameWeight(0x7FFFFFFD)).toBe(0x7FFFFFFE); });
});

describe('The string store object', function () {
    var ss;
    beforeEach(function () { ss = new ABRStringStore(); });
    describe('Tree construction and dumping', function () {
        it('gives one fixed node for the empty string', function () { expect(ss.dump(ss.emptyString)).toBe('!E'); });
        it('creates a node for a singleton', function () { expect(ss.dump(ss.singleton(7))).toBe('7'); });
        it('deduplicates singleton nodes', function () { expect(ss.singleton(7)).toBe(ss.singleton(7)); });
        it('creates different nodes for different singletons', function () { expect(ss.singleton(8)).not.toBe(ss.singleton(9)); });
        it('creates runs for repeated values', function () { expect(ss.dump(ss.concat(ss.singleton(5),ss.singleton(5)))).toBe('[5(*2)]'); });
        it('creates groups for dissimilar values', function () { expect(ss.dump(ss.concat(ss.singleton(5),ss.singleton(6)))).toBe('[5 6]'); });
    });
    // that's about all we can do without being hypersensitive to details of the segmenter

    new ABRStringStore().fromArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    new ABRStringStore().fromArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    new ABRStringStore().fromArray([1,2,3,4,5,5,5,8,9,10]);
    new ABRStringStore().fromArray([1,2,3,4,5,1,2,3,4,6]);
});
