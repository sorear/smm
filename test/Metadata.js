import {parseSync} from '../lib/MMOM';
import {describeDB, testErrorMap} from './lib/Util';
import {expect} from 'chai';
import '../lib/Metadata';

describe('metadata parser:', () => {
    function tcase(hash) {
        describeDB(hash.name, hash.src, dbt => {
            testErrorMap(dbt, () => dbt().metadata.allErrors, hash.errors, { flat: true });
            Object.keys(hash.params || {}).forEach(key => {
                it(`has param ${key}: ${hash.params[key]}`, () => { expect(dbt().metadata.param(key)).to.equal(hash.params[key]); });
            });
        });
    }

    tcase({ name: 'No metadata', src: '', errors: [] });
    tcase({ name: 'Empty', src: '$( $t $)', errors: [] });
    tcase({ name: 'Spurious before', src: '$( /* */ $t $)', errors: [[[3,3],'metadata/marker-not-first'],[[3,3],'metadata/missing-directive'],[[3,5],'metadata/unparsable-field'],[[6,8],'metadata/unparsable-field'],[[9,11],'metadata/unparsable-field'],[[12,12],'metadata/missing-semicolon-eof']] });
    tcase({ name: 'Correct subcomment', src: '$( $t /* */ $)', errors: [] });
    tcase({ name: 'Nonterminated subcomment', src: '$( $t /* $)', errors: [[[6,8],'metadata/unclosed-subcomment']] });
    tcase({ name: 'Subcomment nesting', src: '$( $t /* /* */ $)', errors: [] });
    tcase({ name: 'Subcomment interior whitespace', src: '$( $t /*FOO*/ $)', errors: [] });
    tcase({ name: 'Two subcomments', src: '$( $t /*FOO*/ /*BAR*/ $)', errors: [] });
    tcase({ name: 'Subcomment exterior white space between', src: '$( $t /*FOO*//*BAR*/ $)', errors: [[[13,13],'metadata/mandatory-whitespace']] });
    tcase({ name: 'Missing directive', src: '$( $t ; $)', errors: [[[6,6],'metadata/missing-directive']] });

    tcase({ name: 'Basic parameter', src: '$( $t htmlhome "foo"; $)', errors: [], params: { htmlhome: 'foo' } });
    tcase({ name: 'Parameter with ; missing', src: '$( $t htmlhome "foo" $)', errors: [[[21,21],'metadata/missing-semicolon-eof']] });
    tcase({ name: 'Parameter with extra tokens', src: '$( $t htmlhome "foo" "bar"; $)', errors: [[[21,21],'metadata/expected-end']] });
    tcase({ name: 'Parameter with unquoted argument', src: '$( $t htmlhome foo; $)', errors: [[[15,15],'metadata/expected-string']] });
    tcase({ name: 'Unterminated quote', src: '$( $t htmlhome "foo; $)', errors: [[[15,21],'metadata/nonterminated-string'],[[21,21],'metadata/missing-semicolon-eof']] });
    tcase({ name: 'Unterminated quote (newline)', src: "$( $t htmlhome \"foo\n; $)", errors: [[[15,19],'metadata/nonterminated-string']] });
    tcase({ name: 'Single quote', src: "$( $t htmlhome 'foo'; $)", errors: [], params: { htmlhome: 'foo' } });
    tcase({ name: 'Newline allowed for whitespace', src: "$( $t htmlhome\n'foo'; $)", errors: [], params: { htmlhome: 'foo' } });
    tcase({ name: 'Space allowed before ;', src: "$( $t htmlhome 'foo' /*xyzzy*/; $)", errors: [], params: { htmlhome: 'foo' } });
    tcase({ name: 'Whitespace is mandatory', src: "$( $t htmlhome'foo'; $)", errors: [[[14,14],'metadata/mandatory-whitespace']] });
    tcase({ name: 'Subcomment allowed', src: "$( $t htmlhome /*xyz*/ 'foo'; $)", errors: [], params: { htmlhome: 'foo' } });
    tcase({ name: 'Whitespace required before subcomment', src: "$( $t htmlhome/*xyz*/ 'foo'; $)", errors: [[[14,14],'metadata/mandatory-whitespace']] });
    tcase({ name: 'Whitespace required after subcomment', src: "$( $t htmlhome /*xyz*/'foo'; $)", errors: [[[22,22],'metadata/mandatory-whitespace']] });

    tcase({ name: 'Escape quote by doubling', src: "$( $t htmlhome 'fo''o'; $)", errors: [], params: { htmlhome: "fo'o" } });
    tcase({ name: 'Escape double quote by doubling', src: '$( $t htmlhome "fo""o"; $)', errors: [], params: { htmlhome: 'fo"o' } });
    tcase({ name: 'Other quote need not be doubled', src: '$( $t htmlhome "fo\'o"; $)', errors: [], params: { htmlhome: "fo'o" } });
    tcase({ name: 'Concatenation syntax', src: '$( $t htmlhome "foo" + "bar"; $)', errors: [], params: { htmlhome: "foobar" } });
    tcase({ name: 'Concatenation syntax with comments', src: '$( $t htmlhome "foo" /* Hello\nWorld */ + "bar"; $)', errors: [], params: { htmlhome: "foobar" } });
    tcase({ name: 'Concatenation syntax with differing quotes', src: '$( $t htmlhome "foo" + \'bar\'; $)', errors: [], params: { htmlhome: "foobar" } });
    tcase({ name: 'Concatenation syntax requires space before +', src: '$( $t htmlhome "foo"+ "bar"; $)', errors: [[[20,20],'metadata/mandatory-whitespace']] });
    tcase({ name: 'Concatenation syntax requires space after +', src: '$( $t htmlhome "foo" +"bar"; $)', errors: [[[22,22],'metadata/mandatory-whitespace']] });
    tcase({ name: 'Concatenation syntax requires string after +', src: '$( $t htmlhome "foo" + bar; $)', errors: [[[23,23],'metadata/plus-non-string'],[[23,23],'metadata/expected-end']] });

    tcase({ name: 'Two different parameters', src: '$( $t htmlhome "foo"; exthtmlhome "bar"; $)', errors: [], params: { htmlhome: 'foo', exthtmlhome: 'bar' } });
    tcase({ name: 'Space required after ;', src: '$( $t htmlhome "foo";exthtmlhome "bar"; $)', errors: [[[21,21],'metadata/mandatory-whitespace']] });
    tcase({ name: 'Two different parameters, two comments', src: '$( $t htmlhome "foo"; $) $( $t exthtmlhome "bar"; $)', errors: [], params: { htmlhome: 'foo', exthtmlhome: 'bar' } });
    tcase({ name: 'Two same parameters', src: '$( $t htmlhome "foo"; htmlhome "bar"; $)', errors: [[[22,37],'metadata/duplicate-parameter',{prev:[6,21]}]] });
    tcase({ name: 'Two same parameters, two comments', src: '$( $t htmlhome "foo"; $) $( $t htmlhome "bar"; $)', errors: [[[31,46],'metadata/duplicate-parameter',{prev:[6,21]}]] });

    tcase({ name: 'Unknown directive', src: '$( $t xyzzy; $)', errors: [[[6,11],'metadata/unknown-directive']] });
    tcase({ name: 'Unknown directive skipped with warning', src: '$( $t xyzzy; htmlhome "foo"; $)', errors: [[[6,11],'metadata/unknown-directive']], params: { htmlhome: 'foo' } });
    tcase({ name: 'Unknown directive skipped (keywords)', src: '$( $t xyzzy etaoin shrdlu; htmlhome "foo"; $)', errors: [[[6,11],'metadata/unknown-directive']], params: { htmlhome: 'foo' } });
    tcase({ name: 'Unknown directive skipped (strings)', src: '$( $t xyzzy "hello"; htmlhome "foo"; $)', errors: [[[6,11],'metadata/unknown-directive']], params: { htmlhome: 'foo' } });
});
