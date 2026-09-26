#include "native/keymap.h"
#include <cassert>
#include <cstdio>
int main(){using namespace plico;
 for(int k:{123,124,125,126}){assert(MapKey(k,0,0,Mode::kHidden).action==Action::kOther);assert(MapKey(k,0,kShift,Mode::kHidden).action==Action::kOther);assert(MapKey(k,0,kOption,Mode::kHidden).action==Action::kOther);assert(MapKey(k,0,0,Mode::kLatched).action!=Action::kOther);}
 assert(MapKey(4,'h',kCommand,Mode::kHidden).action==Action::kLeft);
 assert(MapKey(18,'!',kCommand|kShift,Mode::kHidden).stack==0);
 assert(MapKey(29,')',kCommand|kShift,Mode::kHidden).action==Action::kOther);
 assert(MapKey(29,'0',kCommand,Mode::kHidden).action==Action::kOther);
 PlicoBindings slots;slots.slots[9]={29,kControl|kOption};assert(MapKey(29,'0',kControl|kOption,Mode::kHidden,slots).stack==9);assert(MapKey(29,'0',kControl|kOption|kShift,Mode::kHidden,slots).stack==9);assert(MapKey(29,'0',kControl,Mode::kHidden,slots).action==Action::kOther);
 assert(MapKey(8,'c',kCommand,Mode::kHidden).action==Action::kOther);
 assert(MapKey(8,'c',kCommand|kShift,Mode::kHidden).action==Action::kCopyURL);
 assert(MapKey(48,0,kControl|kShift,Mode::kHidden).action==Action::kRecent);
 assert(MapKey(51,0,kCommand,Mode::kHidden).action==Action::kBack);
 assert(MapKey(51,0,0,Mode::kHidden).action==Action::kOther);
 assert(MapKey(51,0,kCommand|kShift,Mode::kHidden).action==Action::kOther);
 PlicoBindings b;b.toggle='o';b.back='g';
 assert(MapKey(31,'o',kCommand,Mode::kHidden,b).action==Action::kToggle);
 assert(MapKey(11,'b',kCommand,Mode::kHidden,b).action==Action::kOther);
 assert(MapKey(51,0,kCommand,Mode::kHidden,b).action==Action::kOther);
 assert(MapKey(5,'g',kCommand,Mode::kHidden,b).action==Action::kBack);
 assert(MapKey(43,';',kCommand|kShift,Mode::kHidden).action==Action::kEditURL);
 puts("Native key mapping regressions passed");}
