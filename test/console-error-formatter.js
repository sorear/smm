var MMOM = require('../lib/smm/mmom');
var expect = require('chai').expect;
require('../lib/smm/console-error-formatter');
require('../lib/smm/scoper');
var smm = require('../lib/smm');

describe('ConsoleErrorFormatter:', function () {
    it('basic case', function () { expect(MMOM.parseSync('afile','$( x\ny $) $. $( z\nw $)').scanner.errors[0].toConsoleString()).to.equal('afile:2:6:error: $. found where not expected (no current statement)\n|y $) »$.« $( z\n'); });
    it('handles variables', function () { expect(MMOM.parseSync('afile','$[ noexist $]').scanner.errors[0].toConsoleString()).to.equal('noexist:1:1:error: Failed to read, reason: Not in passed hash\n|»\n'); });
    it('handles references', function () { var db = MMOM.parseSync('afile','$c x x $.'); expect(db.scoper.errors(db.statement(0))[0].toConsoleString()).to.equal('afile:1:6:error: A math symbol may not be redeclared as a constant\n|$c x »x« $.\nafile:1:4:info: Previous definition\n|$c »x« x $.\n'); });

    describe('dumpErrorMap:', () => {
        it('basic', () => {
            expect(smm.dumpErrorMap(MMOM.parseSync('afile','$( $t foo; $)').metadata.allErrors)).to.equal('afile:1:7:warning: Not a known directive, ignoring\n|$( $t »foo«; $)\n');
        });
    });
});
