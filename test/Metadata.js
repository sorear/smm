import {parseSync} from '../lib/MMOM';
import {describeDB, testErrorMap} from './lib/Util';
import {expect} from 'chai';
import '../lib/Metadata';

describe('metadata parser:', () => {
    function tcase(hash) {
        describeDB(hash.name, hash.src, dbt => {
            testErrorMap(dbt, () => dbt().metadata.allErrors, hash.errors, { flat: true });
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
});
