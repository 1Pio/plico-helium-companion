// Copyright 2026 The plico Authors
// SPDX-License-Identifier: GPL-3.0-only
#pragma once
#include "plico/core/gesture_router.h"
struct PlicoSlotBinding {
  int key = -1;
  unsigned modifiers = 0;
};
struct PlicoBindings {
  std::array<PlicoSlotBinding, 10> slots = {
      {{18, 1}, {19, 1}, {20, 1}, {21, 1}, {23, 1}, {22, 1}, {26, 1}, {28, 1}, {25, 1}, {-1, 0}}};
  char left = 'h', down = 'j', up = 'k', right = 'l', toggle = 'b', new_destination = 't',
       edit = ';', copy = 'c', back = 0;
};
struct PlicoKey {
  plico::Action action = plico::Action::kOther;
  int stack = -1;
};
inline PlicoKey MapKey(int key, char character, unsigned mods, plico::Mode mode,
                       const PlicoBindings& b = PlicoBindings{}) {
  using namespace plico;
  const bool cmd = mods & kCommand;
  PlicoKey r;
  for (int i = 0; i < 10; i++)
    if (b.slots[i].key == key && b.slots[i].modifiers && (mods & ~kShift) == b.slots[i].modifiers) {
      r.action = Action::kStack;
      r.stack = i;
      return r;
    }
  if (mods & kOption) return r;  // Preserve Option editing/browser commands.
  if (key == 53)
    r.action = Action::kEscape;
  else if (key == 36)
    r.action = Action::kAccept;
  else if (key == 48 && (mods & kControl))
    r.action = Action::kRecent;
  else if ((key == 123 && (cmd || mode == Mode::kLatched)) || (cmd && character == b.left))
    r.action = Action::kLeft;
  else if ((key == 124 && (cmd || mode == Mode::kLatched)) || (cmd && character == b.right))
    r.action = Action::kRight;
  else if ((key == 126 && (cmd || mode == Mode::kLatched)) || (cmd && character == b.up))
    r.action = Action::kUp;
  else if ((key == 125 && (cmd || mode == Mode::kLatched)) || (cmd && character == b.down))
    r.action = Action::kDown;
  else if (cmd && !(mods & kShift) &&
           ((b.back == 0 && key == 51) || (b.back && character == b.back)))
    r.action = Action::kBack;
  else if (cmd && !(mods & kShift) && character == 'w' && mode != Mode::kHidden)
    r.action = Action::kClose;
  else if (cmd && !(mods & kShift) && character == 'm')
    r.action = Action::kMute;
  else if (cmd && !(mods & kShift) && character == b.toggle)
    r.action = Action::kToggle;
  else if (cmd && character == b.new_destination && !(mods & kShift))
    r.action = Action::kNewDestination;
  else if (cmd && (!(mods & kShift) || b.edit == ';') && character == b.edit)
    r.action = Action::kEditURL;
  else if (cmd && (mods & kShift) && character == b.copy)
    r.action = Action::kCopyURL;

  return r;
}
