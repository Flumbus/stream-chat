import { translate, type TextKey } from '../../shared/i18n';
// All content is local; authorization codes and credentials never enter the page.
export function oauthCallbackPage(nonce: string, sessionPath: string, locale: 'ru' | 'en' = 'ru') {
  const t = (key: TextKey) => translate(locale, key);
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t('oauthText0')}</title>
<style nonce="${nonce}">
:root{color-scheme:dark;font-family:Segoe UI,Arial,sans-serif;color:#edf0ee;background:#101213}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 10%,#c299ff0b,transparent 60%),#101213}
main{width:100%;max-width:510px;border:1px solid #303632;border-radius:22px;background:#171b19;padding:40px;box-shadow:0 24px 90px #0005}
.brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:650;letter-spacing:-.4px}.logo{width:29px;height:25px;border:2px solid #c299ff;border-radius:8px;position:relative}.logo:after{content:'';position:absolute;bottom:-6px;left:6px;width:8px;height:8px;border-left:2px solid #c299ff;transform:skewY(-35deg);background:#171b19}
.eyebrow{margin:36px 0 16px;font-size:11px;letter-spacing:1.5px;color:#8c9992}.indicator{display:grid;place-items:center;width:56px;height:56px;border-radius:16px;background:#c299ff12;color:#c299ff;font-size:28px}.indicator.pending:after{content:'';width:22px;height:22px;border:2px solid #c299ff30;border-top-color:#c299ff;border-radius:50%;animation:spin 1s linear infinite}
h1{font-size:27px;line-height:1.25;letter-spacing:-.7px;margin:22px 0 12px}p{color:#a5b1aa;line-height:1.65;font-size:14px;overflow-wrap:anywhere}button{margin-top:18px;display:block;width:100%;border:0;border-radius:10px;padding:15px;font:600 14px Segoe UI,Arial,sans-serif;background:#c299ff;color:#16210e;cursor:pointer}button:hover{background:#d3b7ff}button:focus-visible{outline:2px solid white;outline-offset:4px}button:disabled{opacity:.45;cursor:wait}.foot{font-size:12px;color:#78867e;margin:22px 0 0}.error{background:#ff847015;color:#ff9786}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.indicator.pending:after{animation:none}}@media(max-width:480px){main{padding:28px}h1{font-size:24px}}
</style></head><body><main>
<div class="brand"><span class="logo" aria-hidden="true"></span>StreamChat</div>
<div class="eyebrow">${t('oauthText1')}</div>
<div id="indicator" class="indicator pending" aria-hidden="true"></div>
<section role="status" aria-live="polite"><h1 id="title">${t('oauthText2')}</h1><p id="message">${t('oauthText3')}</p></section>
<button id="return" disabled>${t('oauthText4')}</button>
<p id="hint" class="foot">${t('oauthText5')}</p>
<noscript><p>${t('oauthText6')}</p></noscript>
</main><script nonce="${nonce}">
history.replaceState(null,'',${JSON.stringify(sessionPath)});
const endpoint=${JSON.stringify(sessionPath)};
const button=document.getElementById('return'), title=document.getElementById('title'), message=document.getElementById('message'), indicator=document.getElementById('indicator'), hint=document.getElementById('hint');
async function poll(){
 try{const response=await fetch(endpoint+'/status',{cache:'no-store'});if(!response.ok)throw Error();const result=await response.json();
 if(result.state==='pending'){setTimeout(poll,500);return;}
 const ok=result.state==='success';indicator.className='indicator'+(ok?'':' error');indicator.textContent=ok?'✓':'!';
 title.textContent=ok?${JSON.stringify(t('oauthText7'))}:${JSON.stringify(t('oauthText8'))};message.textContent=result.message;button.disabled=false;
 hint.textContent=${JSON.stringify(t('oauthText9'))};
 }catch{indicator.className='indicator error';indicator.textContent='!';title.textContent=${JSON.stringify(t('oauthText10'))};message.textContent=${JSON.stringify(t('oauthText11'))};hint.textContent=${JSON.stringify(t('oauthText12'))};}
}
button.addEventListener('click',async()=>{button.disabled=true;try{
 const response=await fetch(endpoint+'/return',{method:'POST'});if(!response.ok)throw Error();
 window.close();hint.textContent=${JSON.stringify(t('oauthText13'))};
 }catch{hint.textContent=${JSON.stringify(t('oauthText14'))};}});
poll();
</script></body></html>`;
}
