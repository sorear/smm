  $c |- wff ( ) -> $.
  $v ph ps $.
  wph $f wff ph $.
  wps $f wff ps $.
  wi $a wff ( ph -> ps ) $.
  ax-id $a |- ( ph -> ph ) $.
  ${
    dummylink.1 $e |- ph $.
    dummylink.2 $e |- ps $.
    dummylink $p |- ps $= dummylink.2 $.
  $}
  test $p |- ( ph -> ph ) $=
    ( wi ax-id dummylink ) AABZEBZFBZGBZHBZIBZJBZKBZLBZMBZNBZOBZPBZQBZRBZSBZTB
    ZUABZUBBZUCBZUDBZUEBZUFBZUGBZUHBZUIBZUJBZUKBZULBZUMBZUNBZUOBZUPBZUQBZURBZU
    SBZUTBZVABZVBBZVCBZVDBZVEBZVFBZVGBZVHBZVIBZVJBZVKBZVLBZVMBZVNBZVOBZVPBZVQB
    ZVRBZVSBZVTBZWABZWBBZWCBZWDBZWEBZWFBZWGBZWHBAABWHCACD $.
