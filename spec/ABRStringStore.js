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

    // generate ranges (as arrays)
    function range(lo, hi, mod) {
        var out = [];
        for (var i = lo; i <= hi; i++)
            out.push(mod ? i % mod : i);
        return out;
    }

    // the Thue-Morse sequence is highly repetitive but cube-free, so repeat counts will never exceed 2
    function thue(order) {
        var t0 = ss.singleton(0), t1 = ss.singleton(1); // t0 = Thue-Morse at current order; t1 = reversed complement

        while (order--) {
            var tn0 = ss.concat(t0,t1);
            var tn1 = ss.concat(t1,t0);
            t0 = tn0; t1 = tn1;
        }
        return t0;
    }

    describe('Round-tripping', function () {
        it('preserves a non-repeating sequence', function () { expect(ss.toArray(ss.fromArray(range(1,100)),[],200)).toEqual(range(1,100)); });
        it('preserves a highly repeating sequence', function () { expect(ss.toArray(ss.fromArray(range(1,100,3)),[],200)).toEqual(range(1,100,3)); });
        it('preserves a structured nonrepeating sequnce', function () { expect(ss.toArray(thue(3))).toEqual([0,1,1,0,1,0,0,1]); });
    });

    describe('Canonical concatenation', function () {
        it('non-repeating sequence, 70/30 split', function () { expect(ss.concat(ss.fromArray(range(1,70)),ss.fromArray(range(71,100)))).toBe(ss.fromArray(range(1,100))); });
        it('non-repeating sequence, 99/1 split', function () { expect(ss.concat(ss.fromArray(range(1,99)),ss.fromArray(range(100,100)))).toBe(ss.fromArray(range(1,100))); });
        it('non-repeating sequence, 100/0 split', function () { expect(ss.concat(ss.fromArray(range(1,100)),ss.fromArray(range(101,100)))).toBe(ss.fromArray(range(1,100))); });
        it('non-repeating sequence, incremental construction', function () {
            var str = ss.emptyString;
            for (var i = 1; i <= 100; i++) str = ss.concat(str, ss.singleton(i));
            expect(str).toBe(ss.fromArray(range(1,100)));
        });
        it('repeating sequence, 70/30 split', function () { expect(ss.concat(ss.fromArray(range(1,70,3)),ss.fromArray(range(71,100,3)))).toBe(ss.fromArray(range(1,100,3))); });
        it('repeating sequence, 99/1 split', function () { expect(ss.concat(ss.fromArray(range(1,99,3)),ss.fromArray(range(100,100,3)))).toBe(ss.fromArray(range(1,100,3))); });
        it('repeating sequence, incremental construction', function () {
            var str = ss.emptyString;
            for (var i = 1; i <= 100; i++) str = ss.concat(str, ss.singleton(i % 3));
            expect(str).toBe(ss.fromArray(range(1,100, 3)));
        });
    });

    //new ABRStringStore().fromArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    //new ABRStringStore().fromArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    //new ABRStringStore().fromArray([1,2,3,4,5,5,5,8,9,10]);
    //new ABRStringStore().fromArray([1,2,3,4,5,1,2,3,4,6]);
});
