// Copyright 2026 The plico Authors
// SPDX-License-Identifier: GPL-3.0-only
#import <Foundation/Foundation.h>
#include <set>
// Bound nesting before Foundation's recursive JSON parser sees untrusted bytes.
static bool PlicoJSONDepthSafe(NSData* data){
 if(![[NSString alloc]initWithData:data encoding:NSUTF8StringEncoding])return false;
 const unsigned char* bytes=(const unsigned char*)data.bytes;
 unsigned depth=0;bool quoted=false,escaped=false;
 for(NSUInteger i=0;i<data.length;i++){
  unsigned char ch=bytes[i];if(ch==0)return false;
  if(quoted){if(escaped)escaped=false;else if(ch=='\\')escaped=true;else if(ch=='"')quoted=false;continue;}
  if(ch=='"')quoted=true;
  else if(ch=='{'||ch=='['){if(++depth>32)return false;}
  else if(ch=='}'||ch==']'){if(!depth)return false;--depth;}
 }
 return !quoted&&depth==0;
}
static bool PlicoNumber(id value){return [value isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)value)!=CFBooleanGetTypeID();}
static bool PlicoString(id value,NSUInteger bound){return [value isKindOfClass:NSString.class]&&[value length]<=bound;}
static bool PlicoSnapshotValid(NSDictionary*m){
 if(![m isKindOfClass:NSDictionary.class])return false;
 if(m[@"responseFor"]&&m[@"responseFor"]!=NSNull.null&&!PlicoString(m[@"responseFor"],80))return false;
 if(![m isKindOfClass:NSDictionary.class]||!PlicoString(m[@"epoch"],80)||![m[@"epoch"]length]||!PlicoNumber(m[@"revision"])||!PlicoNumber(m[@"active"]))return false;
 NSDictionary*w=m[@"window"];if(![w isKindOfClass:NSDictionary.class])return false;
 for(NSString*k in @[@"id",@"left",@"top",@"width",@"height"])if(!PlicoNumber(w[k]))return false;
 if(![w[@"focused"]isKindOfClass:NSNumber.class]||[w[@"width"]doubleValue]<1||[w[@"height"]doubleValue]<1)return false;
 for(NSString*k in @[@"tabs",@"loose",@"stacks",@"last",@"recent"])if(![m[k]isKindOfClass:NSArray.class])return false;
 if([m[@"stacks"]count]!=10||[m[@"last"]count]!=10||[m[@"tabs"]count]>1000||[m[@"recent"]count]>1000)return false;
 std::set<long long> live,layout,recent;
 for(id t in m[@"tabs"]){if(![t isKindOfClass:NSDictionary.class]||!PlicoNumber(t[@"id"])||!PlicoString(t[@"title"],8192)||!PlicoString(t[@"url"],65536))return false;if(!live.insert([t[@"id"]longLongValue]).second)return false;}
 NSMutableArray*lists=[NSMutableArray arrayWithObject:m[@"loose"]];[lists addObjectsFromArray:m[@"stacks"]];
 for(id a in lists){if(![a isKindOfClass:NSArray.class]||[a count]>1000)return false;for(id x in a){if(!PlicoNumber(x)||!layout.insert([x longLongValue]).second)return false;}}
 if(live!=layout||!live.contains([m[@"active"]longLongValue]))return false;
 for(int s=0;s<10;s++){id x=m[@"last"][s];if(x!=NSNull.null&&(!PlicoNumber(x)||![m[@"stacks"][s]containsObject:x]))return false;}
 for(id x in m[@"recent"]){if(!PlicoNumber(x)||!live.contains([x longLongValue])||!recent.insert([x longLongValue]).second)return false;}
 return true;
}

static bool PlicoResultsValid(id rows){
 if(![rows isKindOfClass:NSArray.class]||[rows count]>64)return false;
 for(id r in rows){if(![r isKindOfClass:NSDictionary.class]||!PlicoString(r[@"title"],8192)||!PlicoString(r[@"url"],65536)||!PlicoString(r[@"location"],100))return false;
  if([r[@"kind"]isEqual:@"tab"]){if(!PlicoNumber(r[@"id"]))return false;}else if(![r[@"kind"]isEqual:@"url"])return false;
 }return true;
}

static bool PlicoAttachmentsValid(NSDictionary*m){
 id available=m[@"available"],attached=m[@"attached"];
 if(![available isKindOfClass:NSNumber.class]||CFGetTypeID((__bridge CFTypeRef)available)!=CFBooleanGetTypeID()||![attached isKindOfClass:NSArray.class]||[attached count]>1000)return false;
 if(![available boolValue]&&[attached count])return false;
 std::set<long long> seen;for(id tab in attached)if(!PlicoNumber(tab)||[tab doubleValue]!=[tab longLongValue]||[tab longLongValue]<0||!seen.insert([tab longLongValue]).second)return false;
 return true;
}
