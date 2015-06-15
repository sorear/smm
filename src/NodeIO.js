var MMOM = require('./MMOM.js');

exports.parseFileSync = function (name) {
    return MMOM.parseSync(name, function (f) { return require('fs').readFileSync(f,'utf8'); });
};
