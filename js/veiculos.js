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
const fmt=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)};
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
 window.CCSPhotoGallery.open({title:'Fotos do veículo · '+(item.placa||''),images,index:Math.max(0,images.findIndex(p=>p.label===(which==='foto_placa_path'?'Placa':'Odômetro')))});
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
 /* Estilos carregados por css/modules.css */
 const r=document.createElement('div');r.id='veiculos-overlay';r.innerHTML='<header class="ccs-module-topbar"><div class="ccs-module-brand"><strong>SECURITY CCS</strong><small>Veículos no Turno</small></div><button id="vt-close">Voltar ao painel</button></header><main><h2>Controle de veículos no turno</h2><p id="veiculos-status" role="status">Carregando...</p><div class="vt-cards"><div class="vt-card"><small>Registros filtrados</small><strong id="vt-total">0</strong></div><div class="vt-card"><small>Placas distintas</small><strong id="vt-plates">0</strong></div><div class="vt-card"><small>Equipes</small><strong id="vt-teams">0</strong></div></div><div class="vt-toolbar"><label>Pesquisar<input id="vt-search" type="search" placeholder="Placa ou equipe"></label><label>Equipe<select id="vt-team"><option value="">Todas as equipes</option></select></label><label>Turno<select id="vt-shift"><option value="">Todos os turnos</option></select></label><label>Data<input id="vt-date" type="date"></label><button id="vt-refresh">Atualizar</button><button id="vt-clear">Limpar filtros</button></div><div class="vt-wrap r-table-wrap"><table class="r-table ccs-standard-table"><thead><tr><th>Placa</th><th>Equipe</th><th>Odômetro</th><th>Turno</th><th>Registrado em</th><th>Fotos</th></tr></thead><tbody id="veiculos-tbody"></tbody></table></div><div class="vt-pager"><button id="vt-prev">Anterior</button><span id="vt-page">Página 1</span><button id="vt-next">Próxima</button></div><section id="veiculos-foto"></section></main>';document.body.appendChild(r);
 el('vt-close').onclick=()=>{el('vt-modal')?.remove();r.remove()};el('vt-refresh').onclick=refresh;el('vt-clear').onclick=()=>{['vt-search','vt-team','vt-shift','vt-date'].forEach(id=>el(id).value='');page=1;draw()};
 for(const id of ['vt-search','vt-team','vt-shift','vt-date'])el(id).addEventListener(id==='vt-search'?'input':'change',()=>{page=1;draw()});
 el('vt-prev').onclick=()=>{page--;draw()};el('vt-next').onclick=()=>{page++;draw()};
 el('veiculos-tbody').onclick=async ev=>{const b=ev.target.closest('[data-vehicle]');if(!b)return;b.disabled=true;try{await gallery(filtered[Number(b.dataset.vehicle)],b.dataset.photo)}catch(e){el('veiculos-status').textContent='Erro ao abrir galeria: '+e.message}finally{b.disabled=false}};
 refresh();
}
window.SecurityVeiculos={show};
})();
