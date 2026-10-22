(function(){
'use strict';
const C=window.PAINEL_CONFIG||{};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client;
async function getClient(){
 if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)throw Error('Supabase não configurado.');
 if(!window.supabase){await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';s.onload=ok;s.onerror=fail;document.head.appendChild(s);});}
 return client||(client=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY));
}
let records=[],page=1;const PAGE_SIZE=15;let filtered=[];
const el=id=>document.getElementById(id);
const fmt=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
function matchRows(){const q=el('vt-search').value.trim().toLowerCase(),team=el('vt-team').value,shift=el('vt-shift').value,day=el('vt-date').value;
 return records.filter(r=>(!q||[r.placa,r.equipe].join(' ').toLowerCase().includes(q))&&(!team||r.equipe===team)&&(!shift||r.turno_chave===shift)&&(!day||(r.registrado_em||'').slice(0,10)===day));
}
function draw(){
 filtered=matchRows();const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);
 const rows=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
 el('vt-total').textContent=filtered.length;el('vt-plates').textContent=new Set(filtered.map(r=>r.placa).filter(Boolean)).size;
 el('vt-teams').textContent=new Set(filtered.map(r=>r.equipe).filter(Boolean)).size;
 el('veiculos-tbody').innerHTML=rows.map((r,i)=>'<tr><td><strong>'+esc(r.placa||'—')+'</strong></td><td>'+esc(r.equipe||'—')+'</td><td>'+esc(r.odometro_km==null?'—':r.odometro_km+' km')+'</td><td><span class="vt-tag">'+esc(r.turno_chave||'—')+'</span></td><td>'+esc(fmt(r.registrado_em))+'</td><td><button type="button" data-vehicle="'+((page-1)*PAGE_SIZE+i)+'" data-photo="foto_placa_path" '+(!r.foto_placa_path?'disabled':'')+'>Placa</button> <button type="button" data-vehicle="'+((page-1)*PAGE_SIZE+i)+'" data-photo="foto_odometro_path" '+(!r.foto_odometro_path?'disabled':'')+'>Odômetro</button></td></tr>').join('')||'<tr><td colspan="6" style="text-align:center;padding:24px">Nenhum registro encontrado.</td></tr>';
 el('vt-page').textContent='Página '+page+' de '+pages;el('vt-prev').disabled=page===1;el('vt-next').disabled=page===pages;
 el('veiculos-status').textContent=filtered.length+' registro(s) encontrados · '+records.length+' carregados';
}
async function gallery(item,which){
 const sb=await getClient(),photos=[['foto_placa_path','Placa'],['foto_odometro_path','Odômetro']];
 const images=(await Promise.all(photos.map(async ([field,label])=>{if(!item[field])return null;const r=await sb.storage.from('veiculo-turno-fotos').createSignedUrl(item[field],600);return r.error?null:{label,url:r.data.signedUrl}}))).filter(Boolean);
 if(!images.length)throw Error('Nenhuma foto disponível neste registro.');
 const area=el('veiculos-foto');let pos=Math.max(0,images.findIndex(p=>p.label===(which==='foto_placa_path'?'Placa':'Odômetro')));
 area.innerHTML='<section class="vt-gallery"><div class="vt-ghead"><h3>Galeria · '+esc(item.placa)+'</h3><button id="vt-photo-close">Fechar</button></div><div class="vt-stage"><button id="vt-prev-photo">‹</button><figure><img id="vt-large" alt=""><figcaption id="vt-caption"></figcaption></figure><button id="vt-next-photo">›</button></div><div class="vt-thumbs" id="vt-thumbs"></div></section>';
 const img=el('vt-large'),caption=el('vt-caption'),thumb=el('vt-thumbs');
 thumb.innerHTML=images.map((p,n)=>'<button type="button" data-thumb="'+n+'"><img src="'+esc(p.url)+'" alt="'+esc(p.label)+'"><span>'+esc(p.label)+'</span></button>').join('');
 function set(n){pos=(n+images.length)%images.length;img.src=images[pos].url;img.alt=images[pos].label;caption.textContent=images[pos].label+' · '+(pos+1)+' de '+images.length;thumb.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===pos)))}
 el('vt-photo-close').onclick=()=>area.innerHTML='';el('vt-prev-photo').onclick=()=>set(pos-1);el('vt-next-photo').onclick=()=>set(pos+1);thumb.querySelectorAll('button').forEach(b=>b.onclick=()=>set(Number(b.dataset.thumb)));set(pos);area.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function refresh(){
 el('veiculos-status').textContent='Atualizando registros...';
 try{const sb=await getClient(),auth=await sb.auth.getUser();if(!auth.data?.user)throw Error('Entre no painel.');
 let all=[],offset=0;
 while(offset<10000){const r=await sb.from('veiculo_turno').select('equipe,placa,odometro_km,turno_chave,registrado_em,foto_placa_path,foto_odometro_path').order('registrado_em',{ascending:false}).range(offset,offset+999);if(r.error)throw r.error;all.push(...(r.data||[]));if((r.data||[]).length<1000)break;offset+=1000}
 records=all;for(const [id,values,label] of [['vt-team',[...new Set(records.map(x=>x.equipe).filter(Boolean))].sort(),'Todas as equipes'],['vt-shift',[...new Set(records.map(x=>x.turno_chave).filter(Boolean))].sort(),'Todos os turnos']]){let select=el(id),old=select.value;select.innerHTML='<option value="">'+label+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');select.value=values.includes(old)?old:'';}
 page=1;draw();el('veiculos-status').textContent+=' · Atualizado às '+new Date().toLocaleTimeString('pt-BR');
 }catch(e){el('veiculos-status').textContent='Erro ao consultar veículos: '+(e.message||e)}
}
function show(){
 if(el('veiculos-overlay'))return;
 if(!el('vt-css')){const css=document.createElement('style');css.id='vt-css';css.textContent=`
#veiculos-overlay{position:fixed;inset:0;z-index:10001;overflow:auto;background:#f3f6fa;color:#0b2942;font:14px Inter,system-ui,sans-serif}
#veiculos-overlay *{box-sizing:border-box}#veiculos-overlay header{background:#0b2942;color:white;padding:14px clamp(12px,3vw,28px);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
#veiculos-overlay button{background:#0b2942;color:#fff;border:0;border-radius:7px;padding:9px 12px;cursor:pointer}#veiculos-overlay button:disabled{opacity:.45;cursor:not-allowed}
#veiculos-overlay main{max-width:1300px;margin:auto;padding:20px}#veiculos-overlay .vt-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
#veiculos-overlay .vt-card{background:white;border:1px solid #dce5ed;border-radius:10px;padding:16px}#veiculos-overlay .vt-card small{display:block;color:#52677a}#veiculos-overlay .vt-card strong{display:block;font-size:25px;margin-top:7px}
#veiculos-overlay .vt-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:15px 0}#veiculos-overlay .vt-toolbar label{display:flex;flex:1 1 175px;flex-direction:column;gap:5px;font-weight:600}
#veiculos-overlay input,#veiculos-overlay select{width:100%;min-width:0;padding:10px;background:white;color:#0b2942;border:1px solid #bdcbd8;border-radius:7px}
#veiculos-overlay .vt-wrap{overflow-x:auto;background:white;border:1px solid #dce5ed;border-radius:10px}#veiculos-overlay table{width:100%;min-width:730px;border-collapse:collapse}#veiculos-overlay th,#veiculos-overlay td{text-align:left;padding:13px;border-bottom:1px solid #e5ebf0}#veiculos-overlay th{background:#eaf0f5}#veiculos-overlay tbody tr:hover{background:#f7fafc}
#veiculos-overlay .vt-tag{padding:5px 9px;border-radius:20px;background:#e4eff7;color:#174466;font-size:12px;font-weight:600}#veiculos-overlay .vt-pager{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:15px 0}
#veiculos-overlay .vt-gallery{background:white;border-radius:12px;padding:16px;margin:18px 0}#veiculos-overlay .vt-ghead{display:flex;justify-content:space-between;align-items:center;gap:10px}
#veiculos-overlay .vt-stage{display:flex;align-items:center;gap:10px;background:#0b2942;padding:12px;border-radius:8px}#veiculos-overlay .vt-stage figure{flex:1;min-width:0;text-align:center;color:white;margin:0}#veiculos-overlay .vt-stage img{max-width:100%;max-height:65vh;object-fit:contain}#veiculos-overlay .vt-thumbs{display:flex;gap:8px;overflow-x:auto;margin-top:12px}#veiculos-overlay .vt-thumbs button{background:white;color:#0b2942;border:2px solid #ddd;min-width:110px}#veiculos-overlay .vt-thumbs button[aria-pressed=true]{border-color:#f58220}#veiculos-overlay .vt-thumbs img{width:105px;height:72px;display:block;object-fit:cover}
@media(max-width:650px){#veiculos-overlay .vt-cards{grid-template-columns:1fr 1fr}#veiculos-overlay .vt-card:last-child{grid-column:span 2}#veiculos-overlay main{padding:12px}}
`;document.head.appendChild(css)}
 const r=document.createElement('div');r.id='veiculos-overlay';r.innerHTML='<header><strong>SECURITY CCS · Veículos no Turno</strong><button id="vt-close">Voltar ao painel</button></header><main><h2>Controle de veículos no turno</h2><p id="veiculos-status" role="status">Carregando...</p><div class="vt-cards"><div class="vt-card"><small>Registros filtrados</small><strong id="vt-total">0</strong></div><div class="vt-card"><small>Placas distintas</small><strong id="vt-plates">0</strong></div><div class="vt-card"><small>Equipes</small><strong id="vt-teams">0</strong></div></div><div class="vt-toolbar"><label>Pesquisar<input id="vt-search" type="search" placeholder="Placa ou equipe"></label><label>Equipe<select id="vt-team"><option value="">Todas as equipes</option></select></label><label>Turno<select id="vt-shift"><option value="">Todos os turnos</option></select></label><label>Data<input id="vt-date" type="date"></label><button id="vt-refresh">Atualizar</button><button id="vt-clear">Limpar filtros</button></div><div class="vt-wrap"><table><thead><tr><th>Placa</th><th>Equipe</th><th>Odômetro</th><th>Turno</th><th>Registrado em</th><th>Fotos</th></tr></thead><tbody id="veiculos-tbody"></tbody></table></div><div class="vt-pager"><button id="vt-prev">Anterior</button><span id="vt-page">Página 1</span><button id="vt-next">Próxima</button></div><section id="veiculos-foto"></section></main>';document.body.appendChild(r);
 el('vt-close').onclick=()=>r.remove();el('vt-refresh').onclick=refresh;el('vt-clear').onclick=()=>{['vt-search','vt-team','vt-shift','vt-date'].forEach(id=>el(id).value='');page=1;draw()};
 for(const id of ['vt-search','vt-team','vt-shift','vt-date'])el(id).addEventListener(id==='vt-search'?'input':'change',()=>{page=1;draw()});
 el('vt-prev').onclick=()=>{page--;draw()};el('vt-next').onclick=()=>{page++;draw()};
 el('veiculos-tbody').onclick=async ev=>{const b=ev.target.closest('[data-vehicle]');if(!b)return;b.disabled=true;try{await gallery(filtered[Number(b.dataset.vehicle)],b.dataset.photo)}catch(e){el('veiculos-status').textContent='Erro ao abrir galeria: '+e.message}finally{b.disabled=false}};
 refresh();
}
window.SecurityVeiculos={show};
})();
