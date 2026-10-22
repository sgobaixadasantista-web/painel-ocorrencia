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
 if(!el('ef-styles')){const css=document.createElement('style');css.id='ef-styles';css.textContent=`
#efetivo-overlay{position:fixed;inset:0;z-index:10001;overflow:auto;background:#f3f6fa;color:#0b2942;font:14px Inter,system-ui,sans-serif}
#efetivo-overlay *{box-sizing:border-box}#efetivo-overlay header{background:#0b2942;color:white;padding:14px clamp(12px,3vw,28px);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
#efetivo-overlay button{cursor:pointer;border:0;border-radius:7px;padding:9px 12px;background:#0b2942;color:white}#efetivo-overlay button:disabled{opacity:.45;cursor:not-allowed}
#efetivo-overlay header button{background:#244660}#efetivo-overlay main{max-width:1300px;margin:auto;padding:20px}
#efetivo-overlay .ef-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
#efetivo-overlay .ef-card{background:white;border:1px solid #dde5ed;border-radius:10px;padding:16px}
#efetivo-overlay .ef-card small{display:block;color:#53677b}#efetivo-overlay .ef-card strong{display:block;font-size:24px;margin-top:7px;overflow-wrap:anywhere}
#efetivo-overlay .ef-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0;align-items:end}
#efetivo-overlay .ef-toolbar label{display:flex;flex-direction:column;gap:4px;font-weight:600;flex:1 1 175px}
#efetivo-overlay input,#efetivo-overlay select{padding:10px;border:1px solid #bdcbd8;border-radius:7px;background:white;color:#0b2942;min-width:0;width:100%}
#efetivo-overlay .ef-table-wrap{overflow-x:auto;background:white;border:1px solid #dde5ed;border-radius:10px}
#efetivo-overlay table{width:100%;border-collapse:collapse;min-width:740px}#efetivo-overlay th{background:#eaf0f5;color:#233c53;text-align:left;white-space:nowrap}
#efetivo-overlay th,#efetivo-overlay td{padding:13px;border-bottom:1px solid #e5ebf0;vertical-align:middle}#efetivo-overlay tbody tr:hover{background:#f7fafc}
#efetivo-overlay .mono{font-variant-numeric:tabular-nums}#efetivo-overlay .ef-pill{background:#e4eff7;color:#174466;border-radius:30px;padding:5px 9px;font-size:12px;font-weight:600}
#efetivo-overlay .ef-empty{text-align:center;padding:26px}#efetivo-overlay .ef-pagination{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin:14px 0}
#efetivo-overlay .ef-photo-card{margin:20px auto;background:white;border:1px solid #dae3ed;padding:16px;border-radius:12px;max-width:640px}
#efetivo-overlay .ef-photo-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
#efetivo-overlay .ef-photo-card img{display:block;max-height:68vh;max-width:100%;object-fit:contain;margin:auto;border-radius:8px}
@media(max-width:650px){#efetivo-overlay .ef-cards{grid-template-columns:1fr 1fr}#efetivo-overlay .ef-card:last-child{grid-column:span 2}#efetivo-overlay main{padding:12px}}
`;document.head.appendChild(css)}
 const r=document.createElement('div');r.id='efetivo-overlay';r.innerHTML='<header class="ccs-module-topbar"><div class="ccs-module-brand"><strong>SECURITY CCS</strong><small>Efetivo no Turno</small></div><button type="button" id="ef-close">Voltar ao painel</button></header><main><h2>Controle de efetivo</h2><p id="efetivo-status" role="status">Carregando...</p><div class="ef-cards"><div class="ef-card"><small>Registros filtrados</small><strong id="ef-count">0</strong></div><div class="ef-card"><small>Equipes</small><strong id="ef-teams">0</strong></div><div class="ef-card"><small>Último registro</small><strong id="ef-last">—</strong></div></div><div class="ef-toolbar"><label>Pesquisar<input type="search" id="ef-search" placeholder="Nome, matrícula ou equipe"></label><label>Equipe<select id="ef-team"><option value="">Todas as equipes</option></select></label><label>Turno<select id="ef-shift"><option value="">Todos os turnos</option></select></label><label>Data<input type="date" id="ef-date"></label><button id="ef-refresh">Atualizar</button><button id="ef-clear">Limpar filtros</button></div><div class="ef-table-wrap r-table-wrap"><table class="r-table ccs-standard-table"><thead><tr><th>Colaborador</th><th>RE / Matrícula</th><th>Equipe</th><th>Turno</th><th>Registrado em</th><th>Foto</th></tr></thead><tbody id="efetivo-tbody"></tbody></table></div><div class="ef-pagination"><button id="ef-prev">Anterior</button><span id="ef-page">Página 1</span><button id="ef-next">Próxima</button></div><section id="efetivo-photo" hidden></section></main>';document.body.appendChild(r);
 el('ef-close').onclick=()=>r.remove();el('ef-refresh').onclick=refresh;el('ef-clear').onclick=()=>{['ef-search','ef-team','ef-shift','ef-date'].forEach(id=>el(id).value='');page=1;draw()};
 for(const id of ['ef-search','ef-team','ef-shift','ef-date'])el(id).addEventListener(id==='ef-search'?'input':'change',()=>{page=1;draw()});
 el('ef-prev').onclick=()=>{page--;draw()};el('ef-next').onclick=()=>{page++;draw()};refresh();
}
window.SecurityEfetivo={show};
})();