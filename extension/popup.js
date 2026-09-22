async function action(type){const r=await chrome.runtime.sendMessage({type});document.querySelector('#status').textContent=r.status;}
document.querySelector('#connect').onclick=()=>action('connect');document.querySelector('#disconnect').onclick=()=>action('disconnect');action('status');
