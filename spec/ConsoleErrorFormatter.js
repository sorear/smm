var ConsoleErrorFormatter = require('../src/ConsoleErrorFormatter');
var MMOM = require('../src/MMOM');
var Scoper = require('../src/Scoper');

describe('ConsoleErrorFormatter:', function () {
    it('basic case', function () { expect(ConsoleErrorFormatter(MMOM.parseSync('afile','$( x\ny $) $. $( z\nw $)').scanErrors)).toBe('afile:2:6:error: $. found where not expected (no current statement)\n|y $) »$.« $( z\n'); });
    it('handles variables', function () { expect(ConsoleErrorFormatter(MMOM.parseSync('afile','$[ noexist $]').scanErrors)).toBe('noexist:1:1:error: Failed to read, reason: Not in passed hash\n|»\n'); });
    it('handles references', function () { var db = MMOM.parseSync('afile','$c x x $.'); expect(ConsoleErrorFormatter(db.scoper.errors)).toBe('afile:1:6:error: A math symbol may not be redeclared as a constant\n|$c x »x« $.\nafile:1:4:info: Previous definition\n|$c »x« x $.\n'); });
});
