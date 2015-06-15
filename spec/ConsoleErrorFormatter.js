var MMOM = require('../src/MMOM');
require('../src/ConsoleErrorFormatter');
require('../src/Scoper');

describe('ConsoleErrorFormatter:', function () {
    it('basic case', function () { expect(MMOM.parseSync('afile','$( x\ny $) $. $( z\nw $)').scanner.errors[0].toConsoleString()).toBe('afile:2:6:error: $. found where not expected (no current statement)\n|y $) »$.« $( z\n'); });
    it('handles variables', function () { expect(MMOM.parseSync('afile','$[ noexist $]').scanner.errors[0].toConsoleString()).toBe('noexist:1:1:error: Failed to read, reason: Not in passed hash\n|»\n'); });
    it('handles references', function () { var db = MMOM.parseSync('afile','$c x x $.'); expect(db.scoper.errors(db.statement(0))[0].toConsoleString()).toBe('afile:1:6:error: A math symbol may not be redeclared as a constant\n|$c x »x« $.\nafile:1:4:info: Previous definition\n|$c »x« x $.\n'); });
});
