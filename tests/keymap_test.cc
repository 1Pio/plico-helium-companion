#include "native/keymap.h"
#include <cassert>
#include <cstdio>
int main(){using namespace plico;
 for(int k:{123,124,125,126}){assert(MapKey(k,0,0,Mode::kHidden).action==Action::kOther);assert(MapKey(k,0,kShift,Mode::kHidden).action==Action::kOther);assert(MapKey(k,0,kOption,Mode::kHidden).action==Action::kOther);assert(MapKey(k,0,0,Mode::kLatched).action!=Action::kOther);}
 assert(MapKey(4,'h',kCommand,Mode::kHidden).action==Action::kLeft);
 assert(MapKey(18,'!',kCommand|kShift,Mode::kHidden).stack==0);
 assert(MapKey(29,')',kCommand|kShift,Mode::kHidden).stack==9);
 assert(MapKey(8,'c',kCommand,Mode::kHidden).action==Action::kOther);
 assert(MapKey(8,'c',kCommand|kShift,Mode::kHidden).action==Action::kCopyURL);
 assert(MapKey(48,0,kControl|kShift,Mode::kHidden).action==Action::kRecent);
 puts("Native key mapping regressions passed");}
