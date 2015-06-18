var text = require('fs').readFileSync(process.argv[2], 'utf8');
var MMOM = require('../lib/MMOM.js');

for (var i = 0; i < 20; i++) {
    var src = new MMOM.Source(null, text);
    var t1 = Date.now();
    var pos = src.lookupPos(text.length);
    console.log(pos, Date.now() - t1, 'ms');
}
