var ABRStringStore = require('../src/ABRStringStore.js');
var argp = require('argparser').defaults({ rounds: 1, cycles: 1000, seed: 1, limit: 1e3, constants: 5 }).nonvals('audit','baseline').parse();
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
BaselineStore.prototype.concat = function (x,y) { return x + y; };
BaselineStore.prototype.split = function (x,i) { return [x.substr(0,i*2),x.substr(i*2)]; };
BaselineStore.prototype.singleton = function (x) { return x < 10 ? '0'+x : ''+x; };
BaselineStore.prototype.length = function (x) { return x.length / 2 };

var seed = argp.opt('seed');
var nrounds = argp.opt('rounds');
var cycles = argp.opt('cycles');
var limit = argp.opt('limit');
var audit = argp.opt('audit');
var baseline = argp.opt('baseline');

while (nrounds-- > 0) {
    console.log('round',seed);
    var rng = srand(seed++);
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

        if (rng() < 0.2) {
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
