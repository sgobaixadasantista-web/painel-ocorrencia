(function(){
'use strict';
const C=window.PAINEL_CONFIG||{};let sb=null,records=[],page=1;const perPage=15;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=id=>document.getElementById(id),fmt=d=>{if(!d)return '—';const v=new Date(d);return Number.isNaN(v.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}).format(v)};
async function client(){if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)throw Error('Supabase não configurado.');if(!window.supabase)await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';s.onload=ok;s.onerror=fail;document.head.appendChild(s)});return sb||(sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY))}
function filters(){let term=el('ef-search').value.toLocaleLowerCase('pt-BR').trim(),team=el('ef-team').value,shift=el('ef-shift').value,dt=el('ef-date').value;return records.filter(r=>(!term||[r.nome,r.matricula,r.equipe].join(' ').toLocaleLowerCase('pt-BR').includes(term))&&(!team||r.equipe===team)&&(!shift||r.turno_chave===shift)&&(!dt||(r.registrado_em||'').slice(0,10)===dt))}
function render(){
 const teams=[...new Set(records.map(r=>r.equipe).filter(Boolean))].sort(),shifts=[...new Set(records.map(r=>r.turno_chave).filter(Boolean))].sort();
 for(const [id,values] of [['ef-team',teams],['ef-shift',shifts]]){const select=el(id),old=select.value;select.innerHTML='<option value="">'+(id==='ef-team'?'Todas as equipes':'Todos os turnos')+'</option>'+values.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');select.value=values.includes(old)?old:''}
 draw();
}
function draw(){
 const filtered=filters(),totalPages=Math.max(1,Math.ceil(filtered.length/perPage));page=Math.min(page,totalPages);const sliced=filtered.slice((page-1)*perPage,page*perPage);
 el('ef-count').textContent=String(filtered.length);
 el('ef-teams').textContent=String(new Set(filtered.map(r=>r.equipe).filter(Boolean)).size);
 el('ef-last').textContent=filtered.length?fmt(filtered[0].registrado_em):'—';
 el('efetivo-tbody').innerHTML=sliced.map((r,i)=>'<tr><td><strong>'+esc(r.nome||'—')+'</strong></td><td class="mono">'+esc(r.matricula||'—')+'</td><td>'+esc(r.equipe||'—')+'</td><td><span class="ef-pill">'+esc(r.turno_chave||'—')+'</span></td><td>'+esc(fmt(r.registrado_em))+'</td><td><button type="button" data-ef-photo="'+((page-1)*perPage+i)+'" '+(!r.foto_path?'disabled':'')+'>Ver selfie</button></td></tr>').join('')||'<tr><td colspan="6" class="ef-empty">Nenhum registro encontrado com estes filtros.</td></tr>';
 el('ef-page').textContent='Página '+page+' de '+totalPages;
 el('ef-prev').disabled=page<=1;el('ef-next').disabled=page>=totalPages;
 el('efetivo-status').textContent=filtered.length+' registro(s) encontrado(s) · '+records.length+' carregados';
 el('efetivo-tbody').querySelectorAll('[data-ef-photo]').forEach(b=>b.onclick=()=>openPhoto(filtered[Number(b.dataset.efPhoto)]));
}
async function openPhoto(r){if(!r||!r.foto_path)return;const box=el('efetivo-photo');box.hidden=false;box.innerHTML='<div class="ef-photo-card">Carregando selfie...</div>';try{const c=await client(),p=await c.storage.from('efetivo-selfies').createSignedUrl(r.foto_path,300);if(p.error)throw p.error;window.CCSPhotoGallery.open({title:'Selfie · '+r.nome+' · '+r.matricula,images:[{label:'Selfie',url:p.data.signedUrl}]});box.hidden=true;box.innerHTML='';}catch(e){box.innerHTML='<div class="ef-photo-card">Não foi possível abrir a selfie: '+esc(e.message)+'</div>'}}
async function refresh(){el('efetivo-status').textContent='Atualizando registros...';try{const c=await client(),auth=await c.auth.getUser();if(!auth.data?.user)throw Error('Entre no painel para consultar.');let all=[],offset=0;for(;;){const res=await c.from('efetivo_turno').select('equipe,matricula,nome,turno_chave,registrado_em,foto_path').order('registrado_em',{ascending:false}).range(offset,offset+999);if(res.error)throw res.error;all.push(...(res.data||[]));if((res.data||[]).length<1000||all.length>=10000)break;offset+=1000;}records=all;page=1;render();el('efetivo-status').textContent+=' · Atualizado às '+new Date().toLocaleTimeString('pt-BR')}catch(e){el('efetivo-status').textContent='Erro ao consultar efetivo: '+e.message}}
function show(){
 if(el('efetivo-overlay'))return;
 /* Estilos carregados por css/modules.css */
 const r=document.createElement('div');r.id='efetivo-overlay';r.innerHTML='<header class="ccs-module-topbar"><div class="ccs-module-brand"><strong>SECURITY CCS</strong><small>Efetivo no Turno</small></div><button type="button" id="ef-close">Voltar ao painel</button></header><main><h2>Controle de efetivo</h2><p id="efetivo-status" role="status">Carregando...</p><div class="ef-cards"><div class="ef-card"><small>Registros filtrados</small><strong id="ef-count">0</strong></div><div class="ef-card"><small>Equipes</small><strong id="ef-teams">0</strong></div><div class="ef-card"><small>Último registro</small><strong id="ef-last">—</strong></div></div><div class="ef-toolbar"><label>Pesquisar<input type="search" id="ef-search" placeholder="Nome, matrícula ou equipe"></label><label>Equipe<select id="ef-team"><option value="">Todas as equipes</option></select></label><label>Turno<select id="ef-shift"><option value="">Todos os turnos</option></select></label><label>Data<input type="date" id="ef-date"></label><button id="ef-refresh">Atualizar</button><button id="ef-clear">Limpar filtros</button></div><div class="ef-table-wrap r-table-wrap"><table class="r-table ccs-standard-table"><thead><tr><th>Colaborador</th><th>RE / Matrícula</th><th>Equipe</th><th>Turno</th><th>Registrado em</th><th>Foto</th></tr></thead><tbody id="efetivo-tbody"></tbody></table></div><div class="ef-pagination"><button id="ef-prev">Anterior</button><span id="ef-page">Página 1</span><button id="ef-next">Próxima</button></div><section id="efetivo-photo" hidden></section></main>';document.body.appendChild(r);
 el('ef-close').onclick=()=>r.remove();el('ef-refresh').onclick=refresh;el('ef-clear').onclick=()=>{['ef-search','ef-team','ef-shift','ef-date'].forEach(id=>el(id).value='');page=1;draw()};
 for(const id of ['ef-search','ef-team','ef-shift','ef-date'])el(id).addEventListener(id==='ef-search'?'input':'change',()=>{page=1;draw()});
 el('ef-prev').onclick=()=>{page--;draw()};el('ef-next').onclick=()=>{page++;draw()};refresh();
}
window.SecurityEfetivo={show};
})();