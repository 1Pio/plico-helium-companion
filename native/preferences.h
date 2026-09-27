// Profile-scoped input configuration received through the validated bridge.
#pragma once
#import <Foundation/Foundation.h>
#include <cmath>
#include <set>
#include "keymap.h"
static bool PlicoPreferences(id value, PlicoBindings& bindings, int& delay) {
  if (!value) {
    bindings = PlicoBindings{};
    delay = 150;
    return true;
  }
  if (![value isKindOfClass:NSDictionary.class] ||
      ![value[@"keys"] isKindOfClass:NSDictionary.class])
    return false;
  id ms = value[@"revealDelayMs"];
  if (![ms isKindOfClass:NSNumber.class] ||
      CFGetTypeID((__bridge CFTypeRef)ms) == CFBooleanGetTypeID())
    return false;
  double n = [ms doubleValue];
  if (!std::isfinite(n) || n < 0 || n > 2000 || n != std::floor(n)) return false;
  if (value[@"theme"] && ![@[ @"system", @"light", @"dark" ] containsObject:value[@"theme"]])
    return false;
  PlicoBindings candidate;
  char* fields[] = {&candidate.left,  &candidate.down,   &candidate.up,
                    &candidate.right, &candidate.toggle, &candidate.new_destination,
                    &candidate.edit,  &candidate.copy,   &candidate.back};
  NSArray* names =
      @[ @"left", @"down", @"up", @"right", @"toggle", @"new", @"edit", @"copy", @"back" ];
  std::set<char> used;
  for (NSUInteger i = 0; i < names.count; i++) {
    id text = value[@"keys"][names[i]];
    if (![text isKindOfClass:NSString.class]) return false;
    char key = 0;
    if (i == 8 && [text isEqual:@"Backspace"])
      key = 0;
    else {
      if ([text length] != 1) return false;
      unichar ch = [text characterAtIndex:0];
      if (!((ch >= 'a' && ch <= 'z') || (i == 6 && ch == ';'))) return false;
      key = (char)ch;
    }
    if (key == 'w' || key == 'm') return false;
    if (i != 7 && (key == 'a' || key == 'c' || key == 'v' || key == 'x' || key == 'z'))
      return false;
    if (!used.insert(key).second) return false;
    *fields[i] = key;
  }
  if (value[@"slots"]) {
    id slots = value[@"slots"];
    if (![slots isKindOfClass:NSArray.class] || [slots count] != 10) return false;
    std::set<std::pair<int, unsigned>> chords;
    const int codes[] = {29, 18, 19, 20, 21, 23, 22, 26, 28, 25};
    for (int i = 0; i < 10; i++) {
      id entry = slots[i];
      candidate.slots[i] = {-1, 0};
      if (entry == NSNull.null) continue;
      if (![entry isKindOfClass:NSDictionary.class]) return false;
      id text = entry[@"key"], mask = entry[@"modifiers"];
      if (![text isKindOfClass:NSString.class] || [text length] != 1 ||
          [text characterAtIndex:0] < '0' || [text characterAtIndex:0] > '9')
        return false;
      if (![mask isKindOfClass:NSNumber.class] ||
          CFGetTypeID((__bridge CFTypeRef)mask) == CFBooleanGetTypeID())
        return false;
      double raw = [mask doubleValue];
      if (!std::isfinite(raw) || raw != floor(raw) || raw < 1 || raw > 11 || ((unsigned)raw & ~11))
        return false;
      int digit = [text characterAtIndex:0] - '0';
      unsigned modifiers = (unsigned)raw;
      if (digit == 0 && modifiers == 1) return false;
      if (!chords.insert({digit, modifiers}).second) return false;
      candidate.slots[i] = {codes[digit], modifiers};
    }
  }
  bindings = candidate;
  delay = (int)n;
  return true;
}
