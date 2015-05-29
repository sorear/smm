var text = require('fs').readFileSync(process.argv[2], 'utf8');
var mmom = require('../src/MMOM.js');

for (var i = 0; i < 20; i++) {
    var src = new mmom.Source(null, text);
    var t1 = Date.now();
    var pos = src.lookupPos(text.length);
    console.log(pos, Date.now() - t1, 'ms');
}
