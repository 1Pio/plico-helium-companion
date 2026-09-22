// Copyright 2026 The plico Authors
// SPDX-License-Identifier: GPL-3.0-only
#include "plico/core/gesture_router.h"
struct PlicoKey {plico::Action action=plico::Action::kOther;int stack=-1;};
inline PlicoKey MapKey(int key,char character,unsigned mods,plico::Mode mode){
 using namespace plico;const bool cmd=mods&kCommand;PlicoKey r;
 if(mods&kOption)return r; // Preserve Option editing/browser commands.
 if(key==53)r.action=Action::kEscape;
 else if(key==36)r.action=Action::kAccept;
 else if(key==48&&(mods&kControl))r.action=Action::kRecent;
 else if((key==123&&(cmd||mode==Mode::kLatched))||(cmd&&character=='h'))r.action=Action::kLeft;
 else if((key==124&&(cmd||mode==Mode::kLatched))||(cmd&&character=='l'))r.action=Action::kRight;
 else if((key==126&&(cmd||mode==Mode::kLatched))||(cmd&&character=='k'))r.action=Action::kUp;
 else if((key==125&&(cmd||mode==Mode::kLatched))||(cmd&&character=='j'))r.action=Action::kDown;
 else if(cmd&&character=='b')r.action=Action::kToggle;
 else if(cmd&&character=='t'&&!(mods&kShift))r.action=Action::kNewDestination;
 else if(cmd&&character==';')r.action=Action::kEditURL;
 else if(cmd&&(mods&kShift)&&character=='c')r.action=Action::kCopyURL;
 else if(cmd){const int codes[]={18,19,20,21,23,22,26,28,25,29};for(int i=0;i<10;i++)if(key==codes[i]){r.action=Action::kStack;r.stack=i;}}
 return r;
}
