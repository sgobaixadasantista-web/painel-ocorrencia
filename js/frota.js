/* Security CCS — gestão de frota e checklist quinzenal. */
(function () {
'use strict';
const DB = window.PAINEL_CONFIG || {};
let client=null, vehicles=[], inspections=[], selected=null, busy=false, searchTerm='';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const today=()=>new Date().toISOString().slice(0,10);
function root(){return document.getElementById('frota-overlay')}
function message(s,error=false){const x=document.getElementById('frota-msg');if(x){x.textContent=s;x.style.color=error?'#b91c1c':'#17603b'}}
async function db(){
 if(!DB.SUPABASE_URL||!DB.SUPABASE_ANON_KEY)throw Error('Configure o Supabase em js/config.js antes de usar a frota.');
 if(!window.supabase){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});}
 return client||(client=window.supabase.createClient(DB.SUPABASE_URL,DB.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}}));
}
function status(v){const a=inspections.filter(i=>i.veiculo_id===v.id&&i.status_checklist!=='PENDENTE').sort((a,b)=>b.data_checklist.localeCompare(a.data_checklist)||b.criado_em.localeCompare(a.criado_em))[0];if(!a)return ['SEM CHECKLIST','warn'];if(a.status_checklist==='IRREGULAR')return ['IRREGULAR','bad'];let days=Math.round((new Date(a.validade_checklist+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000);return days<0?['VENCIDO','bad']:days<=3?['VENCE EM '+days+' DIA(S)','warn']:['EM DIA','ok']}
function style(){/* Estilos consolidados em css/modules.css */}
function render(){
 const counts={ok:0,bad:0,warn:0};vehicles.forEach(v=>counts[status(v)[1]]++);
 root().innerHTML='<div class="f-panel"><div class="f-head ccs-module-topbar"><div class="ccs-module-brand"><strong>SECURITY CCS</strong><small>Frota e Checklists</small></div><div class="f-actions ccs-module-actions"><button type="button" id="frota-refresh">Atualizar</button><button type="button" class="orange" id="frota-newvehicle">Cadastrar veículo</button><button type="button" id="frota-close">Fechar</button></div></div><div id="frota-msg" role="status"></div>'+
 '<div class="f-cards"><div class="f-card">Total de veículos<strong>'+vehicles.length+'</strong></div><div class="f-card">Em dia<strong>'+counts.ok+'</strong></div><div class="f-card">A vencer / Sem checklist<strong>'+counts.warn+'</strong></div><div class="f-card">Vencidos / Irregulares<strong>'+counts.bad+'</strong></div></div>'+
 '<div id="frota-form" class="f-section f-hidden"></div><div class="f-section"><label>Pesquisar veículo<input id="frota-search" placeholder="Digite ao menos 2 caracteres para pesquisar"></label><div class="f-scroll r-table-wrap"><table class="r-table ccs-standard-table"><thead><tr><th>Placa</th><th>Frota</th><th>Empresa</th><th>Modelo</th><th>Situação</th><th>Ação</th></tr></thead><tbody id="frota-rows"></tbody></table></div></div><div id="frota-detail" class="f-section f-hidden"></div></div>';
 document.getElementById('frota-close').onclick=close;
 document.getElementById('frota-refresh').onclick=refresh;
 document.getElementById('frota-newvehicle').onclick=vehicleForm;
 document.getElementById('frota-search').value=searchTerm;document.getElementById('frota-search').oninput=()=>{searchTerm=document.getElementById('frota-search').value.trim();rows()};rows();
}
function rows(){const q=(document.getElementById('frota-search')?.value||'').trim().toUpperCase();if(q.length<2){document.getElementById('frota-rows').innerHTML='<tr><td colspan="6" style="text-align:center;padding:24px">Digite pelo menos 2 caracteres para pesquisar veículos.</td></tr>';return;}document.getElementById('frota-rows').innerHTML=vehicles.filter(v=>[v.placa,v.prefixo_frota,v.empresa,v.modelo].join(' ').toUpperCase().includes(q)).map(v=>{const st=status(v);return '<tr><td>'+E(v.placa)+'</td><td>'+E(v.prefixo_frota||'—')+'</td><td>'+E(v.empresa)+'</td><td>'+E(v.modelo||'—')+'</td><td><span class="f-tag '+st[1]+'">'+st[0]+'</span></td><td><button type="button" data-vehicle="'+E(v.id)+'">Abrir</button> <button type="button" data-editvehicle="'+E(v.id)+'">Editar</button> <button type="button" data-deletevehicle="'+E(v.id)+'">Excluir</button></td></tr>'}).join('')||'<tr><td colspan="6">Nenhum veículo encontrado.</td></tr>';document.querySelectorAll('[data-vehicle]').forEach(b=>b.onclick=()=>detail(b.dataset.vehicle));document.querySelectorAll('[data-editvehicle]').forEach(b=>b.onclick=()=>vehicleForm(vehicles.find(v=>v.id===b.dataset.editvehicle)));document.querySelectorAll('[data-deletevehicle]').forEach(b=>b.onclick=()=>deleteVehicle(b.dataset.deletevehicle))}
function vehicleForm(vehicle){
 const e=document.getElementById('frota-form');e.classList.remove('f-hidden');
 const fields=[['placa','Placa *'],['empresa','Empresa *'],['prefixo_frota','Prefixo / frota'],['tipo','Tipo'],['marca','Marca'],['modelo','Modelo'],['cor','Cor'],['trecho_atuacao','Trecho'],['equipe_posto','Equipe / Posto']];
 e.innerHTML='<h3>'+(vehicle?'Editar veículo':'Novo veículo')+'</h3><form id="frota-vform"><div class="f-grid">'+fields.map(([id,label])=>'<label>'+label+'<input name="'+id+'" value="'+E(vehicle?.[id]||'')+'" '+(['placa','empresa','tipo'].includes(id)?'required':'')+'></label>').join('')+'<label>Status<select name="status">'+['ATIVO','INATIVO','MANUTENCAO','RESERVA'].map(v=>'<option value="'+v+'" '+((vehicle?.status||'ATIVO')===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label></div><p><button class="orange" type="submit">'+(vehicle?'Salvar alterações':'Cadastrar veículo')+'</button> <button type="button" id="frota-cancel">Cancelar</button></p></form>';
 document.getElementById('frota-cancel').onclick=()=>e.classList.add('f-hidden');
 document.getElementById('frota-vform').onsubmit=async ev=>{
 ev.preventDefault();const btn=ev.target.querySelector('[type=submit]');btn.disabled=true;
 try{const data=Object.fromEntries(new FormData(ev.target));data.placa=data.placa.trim().toUpperCase();data.empresa=data.empresa.trim();data.tipo=(data.tipo||'VIATURA').trim();
 if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(data.placa))throw Error('Placa inválida.');
 for(const k in data)if(!data[k]&&k!=='status')delete data[k];
 const c=await db(),r=vehicle?await c.from('veiculos').update(data).eq('id',vehicle.id).select('id'):await c.from('veiculos').insert(data).select('id');
 if(r.error)throw r.error;if(!r.data?.length)throw Error('Sem permissão para alterar este veículo.');
 await refresh();message(vehicle?'Veículo atualizado com sucesso.':'Veículo cadastrado com sucesso.');
 }catch(ex){message(ex.message,true)}finally{btn.disabled=false}
 };
}
async function deleteVehicle(id){
 const v=vehicles.find(x=>x.id===id);if(!v)return;
 const linked=inspections.some(c=>c.veiculo_id===id);
 if(linked){message('Este veículo possui histórico de checklists. Utilize Editar > Status INATIVO para preservar os registros.',true);return;}
 if(!window.confirm('Excluir definitivamente o veículo '+v.placa+'? Esta ação não poderá ser desfeita.'))return;
 try{const c=await db(),r=await c.from('veiculos').delete().eq('id',id).select('id');if(r.error)throw r.error;if(!r.data?.length)throw Error('Exclusão não autorizada ou veículo vinculado a um checklist.');await refresh();message('Veículo excluído com sucesso.')}catch(ex){message('Não foi possível excluir: '+ex.message,true)}
}
function detail(id){selected=vehicles.find(v=>v.id===id);if(!selected)return;const el=document.getElementById('frota-detail');el.classList.remove('f-hidden');const list=inspections.filter(i=>i.veiculo_id===id).sort((a,b)=>b.criado_em.localeCompare(a.criado_em));el.innerHTML='<h3>'+E(selected.placa)+' • '+E(selected.modelo||'Veículo')+'</h3><button type="button" class="orange" id="frota-newcheck">Novo checklist</button><h3>Histórico de inspeções</h3><div class="f-scroll r-table-wrap"><table class="r-table ccs-standard-table"><thead><tr><th>Data</th><th>Validade</th><th>KM</th><th>Status</th><th>Fotos</th></tr></thead><tbody>'+list.map(i=>'<tr><td>'+date(i.data_checklist)+'</td><td>'+date(i.validade_checklist)+'</td><td>'+E(i.odometro_km??'—')+'</td><td>'+E(i.status_checklist)+'</td><td><button type="button" data-photos="'+E(i.id)+'">Ver fotos</button></td></tr>').join('')+'</tbody></table></div><div id="frota-checkform"></div><div id="frota-photos"></div>';document.getElementById('frota-newcheck').onclick=checkForm;document.querySelectorAll('[data-photos]').forEach(x=>x.onclick=()=>photos(x.dataset.photos))}
function checkForm(){const e=document.getElementById('frota-checkform');const names=[['frontal','Frontal'],['traseira','Traseira'],['lateral_esquerda','Lateral esquerda'],['lateral_direita','Lateral direita'],['odometro','Odômetro']];e.innerHTML='<h3>Novo checklist quinzenal</h3><form id="frota-cform"><div class="f-grid"><label>Data da inspeção<input name="data_checklist" type="date" value="'+today()+'" required></label><label>Odômetro (KM)<input name="odometro_km" type="number" min="0" required></label><label>Situação<select name="status_checklist"><option value="OK">OK</option><option value="IRREGULAR">IRREGULAR</option></select></label><label>Responsável<input name="realizado_por" required></label>'+names.map(([key,label])=>'<label>Foto '+label+' *<input type="file" name="'+key+'" accept="image/jpeg,image/png,image/webp" capture="environment" required></label>').join('')+'</div><label>Observações<textarea name="observacoes"></textarea></label><p><button type="submit" class="orange">Concluir e salvar checklist</button></p></form>';document.getElementById('frota-cform').onsubmit=saveCheck;}
async function saveCheck(ev){ev.preventDefault();if(busy)return;busy=true;let uploaded=[];let btn=ev.target.querySelector('button[type=submit]');btn.disabled=true;try{const c=await db(),form=new FormData(ev.target),payload={veiculo_id:selected.id,data_checklist:form.get('data_checklist'),odometro_km:Number(form.get('odometro_km')),status_checklist:form.get('status_checklist'),realizado_por:String(form.get('realizado_por')).trim(),observacoes:String(form.get('observacoes')||'')};for(const key of ['frontal','traseira','lateral_esquerda','lateral_direita','odometro']){const file=form.get(key);if(!(file instanceof File)||!file.size)throw Error('As cinco fotos são obrigatórias.');if(file.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Fotos devem ser JPG, PNG ou WebP até 10MB.');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=selected.id+'/'+crypto.randomUUID()+'-'+key+'.'+ext;const out=await c.storage.from('veiculos-checklist-fotos').upload(path,file,{contentType:file.type,upsert:false});if(out.error)throw out.error;uploaded.push(path);payload['foto_'+key+'_path']=path;}const inserted=await c.from('veiculos_checklist').insert(payload);if(inserted.error)throw inserted.error;await refresh();detail(selected.id);message('Checklist concluído e fotos registradas.')}catch(ex){message(ex.message,true);try{if(uploaded.length)(await db()).storage.from('veiculos-checklist-fotos').remove(uploaded)}catch(_){}}finally{busy=false;btn.disabled=false}}
async function photos(id){
 const inspection=inspections.find(x=>x.id===id);if(!inspection)return;
 const area=document.getElementById('frota-photos');if(!area)return;
 area.innerHTML='<p>Carregando galeria...</p>';
 try{
 const c=await db();
 const types=[['frontal','Frontal'],['traseira','Traseira'],['lateral_esquerda','Lateral esquerda'],['lateral_direita','Lateral direita'],['odometro','Odômetro']];
 const items=(await Promise.all(types.map(async ([key,label])=>{
  const path=inspection['foto_'+key+'_path'];if(!path)return null;
  const result=await c.storage.from('veiculos-checklist-fotos').createSignedUrl(path,600);
  return result.error?null:{label,url:result.data.signedUrl};
 }))).filter(Boolean);
 if(!items.length){area.innerHTML='<p>Nenhuma foto disponível para esta inspeção.</p>';return;}
 window.CCSPhotoGallery.open({title:'Checklist · '+(selected?.placa||''),images:items});area.innerHTML='';
 }catch(error){area.innerHTML='<p role="alert">Não foi possível abrir a galeria: '+E(error.message)+'</p>';}
}
async function refresh(){try{const c=await db();const auth=await c.auth.getUser();if(!auth.data?.user)throw Error('Entre no painel.');const [v,i]=await Promise.all([c.from('veiculos').select('*').order('placa'),c.from('veiculos_checklist').select('*').order('criado_em',{ascending:false})]);if(v.error)throw v.error;if(i.error)throw i.error;vehicles=v.data||[];inspections=i.data||[];render();message('Dados sincronizados com CCS360-V2.')}catch(e){if(root())message('Falha ao consultar frota: '+e.message,true)}}
function close(){root()?.remove()}
function open(){if(root())return;style();const r=document.createElement('div');r.id='frota-overlay';r.setAttribute('role','dialog');r.setAttribute('aria-modal','true');r.setAttribute('aria-label','Gestão de frota');document.body.appendChild(r);r.innerHTML='<div class="f-panel">Carregando frota...</div>';refresh()}
document.addEventListener('click',e=>{if(e.target.closest('[data-act="frota"]')){e.preventDefault();open()}});
window.SecurityFrota={open};
})();