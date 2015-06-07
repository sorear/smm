function code(i) {
    var o = String.fromCharCode( 65 + i % 20 );
    i = Math.floor(i / 20);
    while (i) {
        i--;
        o = String.fromCharCode((65 + 20) + (i % 5)) + o;
        i = Math.floor(i / 5);
    }
    return o;
}

var demo = '';
//build longstr
var nz=4;
demo += code(0);
var lx = 0;

for (var i = 0; i < process.argv[2]; i++) {
    demo += code(lx);
    demo += code(1);
    demo += 'Z';
    lx = nz++;
}
// on stack and =lx, longstr
demo += code(lx);
demo += code(1);

demo += code(0);
demo += code(0);
demo += code(1);

demo += code(lx);
demo += code(2);

demo += code(0);
demo += code(2);

demo += code(3);

process.stdout.write(`
$c |- wff ( ) -> $.
$v ph ps $.
wph $f wff ph $.
wps $f wff ps $.
wi $a wff ( ph -> ps ) $.
ax-id $a |- ( ph -> ph ) $.
${"${"} dummylink.1 $e |- ph $.  dummylink.2 $e |- ps $.
dummylink $p |- ps $= dummylink.2 $. $}
test $p |- ( ph -> ph ) $= ( wi ax-id dummylink ) ${demo} $.
`, 'utf8');
