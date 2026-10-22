/* Security CCS · Navegação unificada v1.1 */
(function(){
'use strict';
const app=()=>document.getElementById('app');
const overlays={'mapa-gps':'gps-overlay','efetivo-turno':'efetivo-overlay','veiculo-turno':'veiculos-overlay','frota':'frota-overlay','colaboradores':'colab-overlay'};
const closeIds={'gps-overlay':'gps-close','efetivo-overlay':'ef-close','veiculos-overlay':'vt-close','frota-overlay':'frota-close','colab-overlay':'colab-close'};
const icons={'nav-intel':'documento','nav-events':'documento','nav-occurrences':'checklist','mapa-gps':'localizar','efetivo-turno':'equipe','veiculo-turno':'vagao',frota:'seguranca',colaboradores:'usuario'};
function icon(name){const paths=window.RUMO_ICONS?.[name];if(!paths)return '';return '<svg class="ccs-nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths.map(p=>'<path d="'+p+'"/>').join('')+'</svg>'}

let expanded=true,mobileOpen=false,modeSeen='',current='nav-events',queued=false;
try{expanded=localStorage.getItem('ccs-nav-collapsed')!=='1'}catch(_){}
function mode(){
 const el=app();if(!el?.querySelector('.r-topbar')||!el.querySelector('main.page')||el.querySelector('#campo-root'))return null;
 return /Inteligência/i.test(el.querySelector('.r-page-h1')?.textContent||'')?'inteligencia':'central';
}
function items(){
 const m=mode();if(!m)return [];
 if(m==='inteligencia')return [{title:'INTELIGÊNCIA',links:[{id:'nav-intel',name:'Ocorrências para análise'},{id:'mapa-gps',name:'Monitoramento GPS'}]}];
 return [
 {title:'OPERAÇÕES',links:[{id:'nav-events',name:'Eventos'},{id:'nav-occurrences',name:'Ocorrências'},{id:'mapa-gps',name:'Monitoramento GPS'}]},
 {title:'GESTÃO',links:[{id:'efetivo-turno',name:'Efetivo no Turno'},{id:'veiculo-turno',name:'Veículo no Turno'},{id:'frota',name:'Frota e Checklists'}]},
 {title:'CADASTROS',links:[{id:'colaboradores',name:'Colaboradores'}]}
 ];
}
function closeOverlay(){
 for(const [id,closeId] of Object.entries(closeIds)){
  if(!document.getElementById(id))continue;
  const button=document.getElementById(closeId);
  if(button)button.click();else document.getElementById(id)?.remove();
 }
}
function syncActive(){
 const nav=document.getElementById('ccs-nav');if(!nav)return;
 if(!Object.values(overlays).some(id=>document.getElementById(id))){
  const occurrence=app()?.querySelector('[data-act="aba"][data-v="ocorrencias"][aria-selected="true"]');
  current=mode()==='inteligencia'?'nav-intel':occurrence?'nav-occurrences':'nav-events';
 }
 nav.querySelectorAll('[data-ccs-action]').forEach(button=>{
  const active=button.dataset.ccsAction===current;
  button.classList.toggle('is-active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
}
function closeMobile(){mobileOpen=false;document.body.classList.remove('ccs-sidebar-mobile-open')}
function setExpanded(next){expanded=next;document.body.classList.toggle('ccs-sidebar-collapsed',!expanded);try{localStorage.setItem('ccs-nav-collapsed',expanded?'0':'1')}catch(_){}}
function navigate(id){
 closeMobile();if(!mode())return;
 closeOverlay();
 if(id==='nav-intel'){current=id;syncActive();return;}
 if(id==='nav-events'||id==='nav-occurrences'){
  const tab=app()?.querySelector('[data-act="aba"][data-v="'+(id==='nav-events'?'eventos':'ocorrencias')+'"]');
  if(tab)tab.click();else app()?.querySelector('[data-act="atualizar"]')?.click();
 }else{
  const button=document.createElement('button');button.type='button';button.hidden=true;button.dataset.act=id;app().appendChild(button);button.click();button.remove();
 }
 current=id;syncActive();
}
function build(){
 const m=mode(),nav=document.getElementById('ccs-nav');
 if(!m){
  nav?.remove();document.getElementById('ccs-nav-backdrop')?.remove();
  document.body.classList.remove('ccs-shell','ccs-sidebar-collapsed','ccs-sidebar-mobile-open');modeSeen='';return;
 }
 if(nav&&modeSeen===m){syncActive();return}
 nav?.remove();document.getElementById('ccs-nav-backdrop')?.remove();modeSeen=m;
 const backdrop=document.createElement('button');backdrop.id='ccs-nav-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','Fechar menu lateral');backdrop.onclick=closeMobile;document.body.appendChild(backdrop);
 const sidebar=document.createElement('aside');sidebar.id='ccs-nav';sidebar.setAttribute('aria-label','Navegação do Security CCS');
 sidebar.innerHTML='<div class="ccs-nav-brand"><strong>SECURITY CCS</strong><button type="button" id="ccs-collapse" aria-label="Recolher ou expandir menu">‹</button></div>'+items().map(group=>
 '<div class="ccs-nav-group"><div class="ccs-nav-caption">'+group.title+'</div>'+group.links.map(item=>
 '<button type="button" class="ccs-nav-link" data-ccs-action="'+item.id+'" title="'+item.name+'"><span class="ccs-nav-icon" aria-hidden="true">'+icon(icons[item.id])+'</span><span class="ccs-nav-text">'+item.name+'</span></button>').join('')+'</div>').join('');
 document.body.appendChild(sidebar);document.body.classList.add('ccs-shell');setExpanded(expanded);
 sidebar.querySelector('#ccs-collapse').onclick=()=>setExpanded(!expanded);
 sidebar.querySelectorAll('[data-ccs-action]').forEach(button=>button.onclick=()=>navigate(button.dataset.ccsAction));
 syncActive();
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-act="nav-toggle"]')){
  event.preventDefault();
  if(window.matchMedia('(max-width:1023px)').matches){mobileOpen=!mobileOpen;document.body.classList.toggle('ccs-sidebar-mobile-open',mobileOpen)}
  else setExpanded(!expanded);
 }
 const tab=event.target.closest('[data-act="aba"]');
 if(tab){current=tab.dataset.v==='ocorrencias'?'nav-occurrences':'nav-events';queueMicrotask(syncActive)}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobile()});
const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;build()})});
function start(){
 if(!app())return;
 observer.observe(app(),{subtree:true,childList:true,attributes:true,attributeFilter:['aria-selected']});
 // Observe overlays only for visibility changes; avoid observing sidebar changes.
 const bodyObserver=new MutationObserver(records=>{
  if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&n.id&&Object.values(overlays).includes(n.id))))syncActive();
 });
 bodyObserver.observe(document.body,{childList:true});
 build();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
