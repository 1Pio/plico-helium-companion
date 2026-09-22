// Only Helium's explicit empty-history result may trigger return-to-opener.
// An arbitrary API failure must never close a tab.
export async function backToOpener(api,windowId,tabId){
 const before=await api.get(tabId);
 if(before.windowId!==windowId||!before.active)throw Error('Active tab changed');
 try{await api.goBack(tabId);return 'history';}
 catch(error){
  if(error.message!=='Cannot find a next page in history.')throw error;
  if(!Number.isSafeInteger(before.openerTabId)||before.pendingUrl)throw error;
  const live=await api.get(tabId),opener=await api.get(before.openerTabId);
  if(live.windowId!==windowId||!live.active||live.url!==before.url||live.pendingUrl||live.openerTabId!==opener.id||opener.windowId!==windowId)throw Error('Tab changed; return to opener canceled');
  await api.update(opener.id,{active:true});
  const final=await api.get(tabId);
  if(final.windowId!==windowId||final.active||final.url!==before.url||final.pendingUrl||final.openerTabId!==opener.id)throw Error('Tab changed; close canceled');
  // Chromium may leave this promise pending when beforeunload is canceled.
  // Never await it on the global navigation queue. Browser events reconcile
  // the actual tab state; requesting closure does not prove it happened.
  return {outcome:'closing',completion:api.remove(tabId)};
 }
}
