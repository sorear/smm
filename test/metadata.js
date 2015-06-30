import {parseSync} from '../lib/smm/mmom';
import {describeDB, testErrorMap} from './lib/util';
import {expect} from 'chai';
import '../lib/smm/metadata';

describe('metadata parser:', () => {
    function tcase(hash) {
        describeDB(hash.name, hash.src, dbt => {
            if (hash.errors) testErrorMap(dbt, () => dbt().metadata.allErrors, hash.errors, { flat: true });
            Object.keys(hash.params || {}).forEach(key => {
                it(`has param ${key}: ${hash.params[key]}`, () => { expect(dbt().metadata.param(key)).to.equal(hash.params[key]); });
            });
            (hash.html || []).forEach(html =>
                it(`has ${html[0]} for ${html[1]} = ${html[2]}`, () => expect(dbt().metadata.tokenDef(html[0],html[1])).equal(html[2])));
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
    tcase({ name: 'Parameter functions without checking errors', src: '$( $t htmlhome "foo"; $)', params: { htmlhome: 'foo' } });
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

    tcase({ name: 'Basic htmldef', src: '$c foo $. $( $t htmldef "foo" as "bar"; $)', errors: [], html: [['htmldef','foo','bar'],['htmldef','abc',null]] });
    tcase({ name: 'htmldef for two symbols', src: '$c foo bar $. $( $t htmldef "foo" as "baz"; htmldef "bar" as "quux"; $)', errors: [], html: [['htmldef','foo','baz'],['htmldef','bar','quux']] });
    tcase({ name: 'htmldef for two types', src: '$c foo $. $( $t htmldef "foo" as "bar"; althtmldef "foo" as "baz"; $)', errors: [], html: [['htmldef','foo','bar'],['althtmldef','foo','baz']] });
    tcase({ name: 'conflicting htmldef', src: '$c foo $. $( $t htmldef "foo" as "bar"; htmldef "foo" as "baz"; $)', errors: [[[40,63],'metadata/conflicting-htmldef',{prev:[16,39]}]], html: [['htmldef','foo','bar']] });
    tcase({ name: 'htmldef without math symbol', src: '$( $t htmldef "foo" as "bar"; $)', errors: [[[14,19],'metadata/htmldef-no-math']], html: [['htmldef','foo','bar']] });
    tcase({ name: 'htmldef without math symbol (but with label)', src: '$c abc $. foo $a abc $. $( $t htmldef "foo" as "bar"; $)', errors: [[[38,43],'metadata/htmldef-no-math']], html: [['htmldef','foo','bar']] });
    tcase({ name: 'htmldef syntax, expect quote', src: '$( $t htmldef foo as "bar"; $)', errors: [[[14,14],'metadata/expected-string']] });
    tcase({ name: 'htmldef syntax, expect "as" (keyword)', src: '$( $t htmldef "foo" asdf "bar"; $)', errors: [[[20,24],'metadata/expected-as']] });
    tcase({ name: 'htmldef syntax, expect "as" (other)', src: '$( $t htmldef "foo" ; $)', errors: [[[20,20],'metadata/expected-as']] });
    tcase({ name: 'htmldef syntax, result quote', src: '$( $t htmldef "foo" as bar; $)', errors: [[[23,23],'metadata/expected-string']] });
    tcase({ name: 'htmldef syntax, trailing', src: '$( $t htmldef "foo" as "bar" baz; $)', errors: [[[29,29],'metadata/expected-end']] });
});
