var ABRStringStore = require('../lib/ABRStringStore.js');
var argp = require('argparser').defaults({ rounds: 1, cycles: 1000, seed: 1, limit: 1e3, constants: 5, mix: 0.2, lcp_mix: 0 }).nonvals('audit','baseline','repeat').parse();
var crypto = require('crypto');

function srand(seed) {
    var key = new Buffer(16).fill(0);
    key.writeInt32BE(seed,0);
    var ciph = crypto.createCipheriv('aes-128-ctr', key, key);
    var work = null;
    var index = 16384;
    var div = Math.pow(2,32);

    return function () {
        if (index == 16384) { index = 0; work = ciph.update(new Buffer(16384).fill(0)); }
        var rand32 = work.readUInt32BE(index);
        index += 4;
        return rand32 / div;
    };
}

function BaselineStore() { }
BaselineStore.prototype.emptyString = '';
var q;
BaselineStore.prototype.concat = function (x,y) { var r = x + y; q = r[0]; return r; }; // defeat ConsString optimization
BaselineStore.prototype.split = function (x,i) { return [x.substr(0,i*2),x.substr(i*2)]; };
BaselineStore.prototype.singleton = function (x) { return x < 10 ? '0'+x : ''+x; };
BaselineStore.prototype.length = function (x) { return x.length / 2 };

var seed = argp.opt('seed');
var nrounds = argp.opt('rounds');
var cycles = argp.opt('cycles');
var limit = argp.opt('limit');
var audit = argp.opt('audit');
var baseline = argp.opt('baseline');
var mix = argp.opt('mix');
var lcp_mix = argp.opt('lcp_mix');

while (nrounds-- > 0) {
    console.log('round',seed);
    var rng = srand(seed);
    if (!argp.opt('repeat')) seed++;
    var ss = baseline ? new BaselineStore() : new ABRStringStore();
    var start = Date.now();
    var ary = [];
    var pool = new Set();

    for (var ncon = 0; ncon < argp.opt('constants'); ncon++) {
        var con = ss.singleton(ncon);
        ary.push(con);
        pool.add(con);
    }
    var maxlen = 1;

    for (var step_num = 0; step_num < cycles; step_num++) {
        var ix1 = Math.floor(rng() * ary.length);

        if (lcp_mix && rng() < lcp_mix) {
            var ix2 = Math.floor(rng() * ary.length);

            var lcp = ss.lcpBig(ary[ix1],ary[ix2]);
            var compare = ss.compare(ary[ix1],ary[ix2]);
            var lcs = ss.lcsBig(ary[ix1],ary[ix2]);

            //var tostr = ABRStringStore.BigInt.bigInt2str;
            //console.log(tostr(lcp,10),tostr(lcs,10),ss.toArray(ary[ix1]).join(''),ss.toArray(ary[ix2]).join(''),compare);
            // make sure the common prefixes and suffixes are common
            if (ABRStringStore.BigInt.greater(lcp, ss.lengthBig(ary[ix1]))) throw 'lcp longer than A';
            if (ABRStringStore.BigInt.greater(lcs, ss.lengthBig(ary[ix1]))) throw 'lcs longer than A';
            if (ABRStringStore.BigInt.greater(lcp, ss.lengthBig(ary[ix2]))) throw 'lcp longer than B';
            if (ABRStringStore.BigInt.greater(lcs, ss.lengthBig(ary[ix2]))) throw 'lcs longer than B';
            var sres1 = ss.split(ary[ix1],lcp);
            var sres2 = ss.split(ary[ix2],lcp);
            var sres3 = ss.split(ary[ix1],ABRStringStore.BigInt.sub(ss.lengthBig(ary[ix1]),lcs));
            var sres4 = ss.split(ary[ix2],ABRStringStore.BigInt.sub(ss.lengthBig(ary[ix2]),lcs));
            if (sres1[0] !== sres2[0]) throw 'lcp not a common prefix';
            if (sres3[1] !== sres4[1]) throw 'lcs not a common suffix';

            // make sure they are maximal and that the differing part agrees with the comparison
            var lcpnext1 = ss.split(sres1[1],1)[0];
            var lcpnext2 = ss.split(sres2[1],1)[0];
            var ONE = ABRStringStore.BigInt.int2bigInt(1,1);
            var lcsnext1 = ss.split(sres3[0],ABRStringStore.BigInt.sub(ss.lengthBig(sres3[0]),ONE))[1];
            var lcsnext2 = ss.split(sres4[0],ABRStringStore.BigInt.sub(ss.lengthBig(sres4[0]),ONE))[1];

            if (lcpnext1 !== ss.emptyString && lcpnext1 === lcpnext2) throw 'lcp not maximal';
            if (lcsnext1 !== ss.emptyString && lcsnext1 === lcsnext2) throw 'lcs not maximal';
            if (compare === 0) {
                if (lcpnext1 !== ss.emptyString) throw 'equality but common proper prefix';
            }
            else if (compare > 0) {
                if (lcpnext1 === ss.emptyString) throw '"" should not be greater than anything';
                if (lcpnext2 !== ss.emptyString && ss.toArray(lcpnext1)[0] <= ss.toArray(lcpnext2)[0]) throw 'string is greater, but elements disagree';
            }
            else if (compare < 0) {
                if (lcpnext2 === ss.emptyString) throw '"" should not be greater than anything';
                if (lcpnext1 !== ss.emptyString && ss.toArray(lcpnext1)[0] >= ss.toArray(lcpnext2)[0]) throw 'string is less, but elements disagree';
            }
            else {
                throw 'compare is NaN?';
            }
        }
        else if (rng() < mix) {
            var split_arg_len = ss.length(ary[ix1]);
            /* concentrate probability near the edges */
            var split_at = Math.floor(( split_arg_len + 1 ) * (Math.cbrt(2*rng()-1)+1) / 2);
            var split_res = ss.split(ary[ix1], split_at);

            if (!pool.has(split_res[0])) {
                if (audit && ss.fromArray(ss.toArray(split_res[0])) !== split_res[0]) throw 'Audit failure: ' + ss.toArray(ary[ix1]).join(',') + '/' + split_at;
                pool.add(split_res[0]);
                ary.push(split_res[0]);
            }

            if (!pool.has(split_res[1])) {
                if (audit && ss.fromArray(ss.toArray(split_res[1])) !== split_res[1]) throw 'Audit failure: ' + ss.toArray(ary[ix1]).join(',') + '/' + split_at;
                pool.add(split_res[1]);
                ary.push(split_res[1]);
            }
        }
        else {
            var ix2 = Math.floor(rng() * ary.length);
            if (ss.length(ary[ix1]) + ss.length(ary[ix2]) > limit) { step_num--; continue; }
            var cat_res = ss.concat(ary[ix1], ary[ix2]);
            maxlen = Math.max(maxlen, ss.length(cat_res));

            if (!pool.has(cat_res)) {
                //console.log(ss.dump(ary[ix1]), ss.dump(ary[ix2]), ss.dump(cat_res));
                if (audit && ss.fromArray(ss.toArray(cat_res)) !== cat_res) throw 'Audit failure: ' + ss.toArray(ary[ix1]).join(',') + ' ' + ss.toArray(ary[ix2]).join(',');
                pool.add(cat_res);
                ary.push(cat_res);
            }
        }

        if (ary.length > 1000) ary.shift();
    }
    var stop = Date.now();
    console.log(stop - start, 'ms', 'len', maxlen);
}
