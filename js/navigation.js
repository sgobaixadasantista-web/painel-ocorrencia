/* Security CCS - Navigation Shell v1.0 */
(function(){
'use strict';
const root=()=>document.getElementById('app');
let expanded=true,openMobile=false,lastMode='',syncing=false;
try{expanded=localStorage.getItem('ccs-nav-collapsed')!=='1'}catch(_){}
const icon={home:'⌂',occur:'▤',gps:'◎',team:'♙',vehicle:'▣',fleet:'▥',users:'♙'};
function mode(){const r=root();if(!r||!r.querySelector('.r-topbar')||!r.querySelector('main.page')||r.querySelector('#campo-root'))return null;const title=r.querySelector('.r-page-h1')?.textContent||'';return /Inteligência/i.test(title)?'inteligencia':'central'}
function allowed(){const m=mode();if(!m)return [];return [
 {group:'OPERAÇÕES',items:[{text:'Visão geral',action:'nav-home',ico:'home'},...(m==='central'?[{text:'Ocorrências',action:'nav-occurrences',ico:'occur'}]:[{text:'Ocorrências',action:'nav-home',ico:'occur'}]),{text:'Monitoramento GPS',action:'mapa-gps',ico:'gps'}]},
 ...(m==='central'?[{group:'GESTÃO',items:[{text:'Efetivo no Turno',action:'efetivo-turno',ico:'team'},{text:'Veículo no Turno',action:'veiculo-turno',ico:'vehicle'},{text:'Frota e Checklists',action:'frota',ico:'fleet'}]},{group:'CADASTROS',items:[{text:'Colaboradores',action:'colaboradores',ico:'users'}]}]:[])
 ]}
function build(){const groups=allowed(),m=mode(),nav=document.getElementById('ccs-nav'),scrim=document.getElementById('ccs-nav-backdrop');if(!m){nav?.remove();scrim?.remove();document.body.classList.remove('ccs-shell','ccs-sidebar-collapsed','ccs-sidebar-mobile-open');lastMode='';return}
 if(nav&&m===lastMode){document.body.classList.toggle('ccs-sidebar-collapsed',!expanded);document.body.classList.toggle('ccs-sidebar-mobile-open',openMobile);syncSelection();return}
 nav?.remove();scrim?.remove();lastMode=m;
 const backdrop=document.createElement('button');backdrop.id='ccs-nav-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','Fechar navegação');backdrop.onclick=closeMobile;document.body.appendChild(backdrop);
 const el=document.createElement('aside');el.id='ccs-nav';el.setAttribute('aria-label','Navegação principal');el.innerHTML='<div class="ccs-nav-brand"><strong>SECURITY CCS</strong><button type="button" id="ccs-collapse" title="Recolher ou expandir menu" aria-label="Recolher ou expandir menu">‹</button></div>'+
 groups.map(g=>'<div class="ccs-nav-group"><div class="ccs-nav-caption">'+g.group+'</div>'+g.items.map(item=>'<button type="button" class="ccs-nav-link" data-ccs-action="'+item.action+'" title="'+item.text+'"><span class="ccs-nav-icon" aria-hidden="true">'+icon[item.ico]+'</span><span class="ccs-nav-text">'+item.text+'</span></button>').join('')+'</div>').join('');
 document.body.appendChild(el);document.body.classList.add('ccs-shell');document.body.classList.toggle('ccs-sidebar-collapsed',!expanded);document.body.classList.toggle('ccs-sidebar-mobile-open',openMobile);
 el.querySelector('#ccs-collapse').onclick=()=>{expanded=!expanded;try{localStorage.setItem('ccs-nav-collapsed',expanded?'0':'1')}catch(_){}document.body.classList.toggle('ccs-sidebar-collapsed',!expanded)};
 el.querySelectorAll('[data-ccs-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.ccsAction;closeMobile();if(a==='nav-home'||a==='nav-occurrences'){const target=a==='nav-home'?'eventos':'ocorrencias';const tab=root()?.querySelector('[data-act="aba"][data-v="'+target+'"]');if(tab)tab.click();else if(a==='nav-home'){root()?.querySelector('[data-act="atualizar"]')?.click()}syncSelection();return;}const button=document.createElement('button');button.type='button';button.dataset.act=a;button.hidden=true;root().appendChild(button);button.click();button.remove();syncSelection()});
 syncSelection()
}
function syncSelection(){const nav=document.getElementById('ccs-nav');if(!nav)return;const occurrences=root()?.querySelector('[data-act="aba"][data-v="ocorrencias"][aria-selected="true"]');nav.querySelectorAll('.ccs-nav-link').forEach(b=>{const active=b.dataset.ccsAction===(occurrences?'nav-occurrences':'nav-home');b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')})}
function closeMobile(){openMobile=false;document.body.classList.remove('ccs-sidebar-mobile-open')}
document.addEventListener('click',e=>{if(e.target.closest('[data-act="nav-toggle"]')){e.preventDefault();if(window.matchMedia('(max-width: 1023px)').matches){openMobile=!openMobile;document.body.classList.toggle('ccs-sidebar-mobile-open',openMobile)}else{expanded=!expanded;document.body.classList.toggle('ccs-sidebar-collapsed',!expanded);try{localStorage.setItem('ccs-nav-collapsed',expanded?'0':'1')}catch(_){}}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobile()});
const observer=new MutationObserver(()=>{if(syncing)return;syncing=true;queueMicrotask(()=>{syncing=false;build()})});
function start(){const r=root();if(!r)return;observer.observe(r,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-selected']});build()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
