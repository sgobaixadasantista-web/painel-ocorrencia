/* Security CCS · Postos e Escalas (módulo do painel, abre ao lado do menu lateral).
   Cadastro reservado ao administrador; as políticas do banco também conferem isso. */
(function(){
'use strict';
const C=window.PAINEL_CONFIG||{};
const DIAS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
let sb=null,postos=[],escalas=[],tipos=[];
/** Conta de acesso ao app de cada posto (login -> situação), lida pela função gerenciar-acesso-posto. */
let contas={},contasErro=null;
const $=id=>document.getElementById(id);
const root=()=>$('postos-overlay');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function client(){
 if(!C.SUPABASE_URL||!C.SUPABASE_ANON_KEY)throw Error('Configure a URL e a chave pública do Supabase em js/config.js para usar a gestão de postos.');
 if(!window.supabase)await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='js/vendor/supabase-2.45.4.js';s.onload=ok;s.onerror=fail;document.head.appendChild(s)});
 return sb||(sb=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}}));
}
function msg(texto,erro){const el=$('postos-msg');if(!el)return;el.textContent=texto;el.className='ccs-modulo-msg'+(erro?' is-erro':' is-ok');}
function close(){root()?.remove();}

function layout(){
 root().innerHTML='<div class="ccs-modulo-painel">'+
 '<header class="ccs-module-topbar"><div class="ccs-module-brand"><strong>SECURITY CCS</strong><small>Postos e Escalas</small></div>'+
 '<div class="ccs-module-actions"><button type="button" id="postos-refresh">Atualizar</button> <button type="button" id="postos-close">Voltar ao painel</button></div></header>'+
 '<div class="ccs-modulo-intro"><h2>Postos e escalas operacionais</h2><p>Cadastro reservado ao administrador. O acesso do posto ao app (login e senha) é criado na coluna "Acesso ao app" da lista de postos.</p></div>'+
 '<p id="postos-msg" class="ccs-modulo-msg" role="status">Carregando...</p>'+
 '<div id="postos-conteudo" hidden>'+
 '<section class="ccs-modulo-card"><h3>Postos</h3><form id="postos-form" class="ccs-modulo-grid">'+
  '<input type="hidden" name="id">'+
  '<label>Código do posto<input name="codigo" placeholder="EN0.001" required maxlength="50"></label>'+
  '<label>Login permanente<input name="login" placeholder="en0.001" required maxlength="80"></label>'+
  '<label>Trecho<input name="trecho" required placeholder="0"></label>'+
  '<label>Tipo<select name="tipo_posto_id" required></select></label>'+
  '<label>Status<select name="status"><option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="suspenso">Suspenso</option></select></label>'+
  '<div class="ccs-modulo-botoes"><button type="submit" class="is-primario">Salvar posto</button> <button type="button" id="postos-novo">Novo</button></div>'+
 '</form><div class="ccs-modulo-scroll"><table><thead><tr><th>Código</th><th>Trecho</th><th>Tipo</th><th>Status</th><th>Login</th><th>Acesso ao app</th><th></th></tr></thead><tbody id="postos-lista"></tbody></table></div></section>'+
 '<section class="ccs-modulo-card"><h3>Escalas</h3><form id="escalas-form" class="ccs-modulo-grid">'+
  '<input type="hidden" name="id">'+
  '<label>Posto<select name="posto_id" required></select></label>'+
  '<label>Nome da escala<input name="nome" required placeholder="Diurno"></label>'+
  '<label>Início<input type="time" name="inicio" required value="06:00"></label>'+
  '<label>Fim<input type="time" name="fim" required value="18:00"></label>'+
  '<label>Efetivo esperado<input type="number" name="efetivo_esperado" min="1" max="100" required value="2"></label>'+
  '<label>Tolerância (min)<input type="number" name="tolerancia_min" min="0" max="240" value="20" required></label>'+
  '<label>Vigente desde<input type="date" name="vigente_desde" required></label>'+
  '<label>Vigente até<input type="date" name="vigente_ate"></label>'+
  '<label>Veículo obrigatório<select name="exige_veiculo"><option value="true">Sim</option><option value="false">Não</option></select></label>'+
  '<label>Exigir efetivo<select name="exige_efetivo"><option value="true">Sim</option><option value="false">Não</option></select></label>'+
  '<label>Ativa<select name="ativo"><option value="true">Sim</option><option value="false">Não</option></select></label>'+
  '<fieldset class="ccs-modulo-span"><legend>Dias da semana</legend><div class="ccs-modulo-dias">'+DIAS.map((d,i)=>'<label class="ccs-modulo-dia"><input type="checkbox" name="dia" value="'+i+'" checked> '+d+'</label>').join('')+'</div></fieldset>'+
  '<div class="ccs-modulo-botoes ccs-modulo-span"><button type="submit" class="is-primario">Salvar escala</button> <button type="button" id="escalas-nova">Nova</button></div>'+
 '</form><div class="ccs-modulo-scroll"><table><thead><tr><th>Posto</th><th>Escala</th><th>Horário</th><th>Efetivo</th><th>Veículo</th><th>Dias</th><th></th></tr></thead><tbody id="escalas-lista"></tbody></table></div></section>'+
 '</div>'+
 // janela para criar acesso / redefinir senha (a senha não fica guardada no painel)
 '<div id="acesso-janela" class="ccs-modulo-janela" role="dialog" aria-modal="true" aria-labelledby="acesso-titulo" hidden><form id="acesso-form" class="ccs-modulo-card">'+
  '<h3 id="acesso-titulo">Acesso ao app</h3><p id="acesso-info" class="ccs-modulo-msg"></p>'+
  '<label>Senha<input type="password" name="senha" autocomplete="new-password" minlength="8" maxlength="72" required></label>'+
  '<label>Repita a senha<input type="password" name="senha2" autocomplete="new-password" minlength="8" maxlength="72" required></label>'+
  '<label class="ccs-modulo-dia"><input type="checkbox" id="acesso-mostrar"> Mostrar senha</label>'+
  '<p class="ccs-modulo-dica">Mínimo de 8 caracteres, com letras e números. Use uma senha diferente para cada posto e entregue só à equipe do posto.</p>'+
  '<p id="acesso-erro" class="ccs-modulo-msg is-erro" role="alert"></p>'+
  '<div class="ccs-modulo-botoes"><button type="submit" class="is-primario" id="acesso-salvar">Salvar</button> <button type="button" id="acesso-cancelar">Cancelar</button></div>'+
 '</form></div>'+
 '</div>';
 $('postos-close').onclick=close;
 $('postos-refresh').onclick=()=>iniciar();
}

function option(v,t){const o=document.createElement('option');o.value=v;o.textContent=t;return o;}
function linha(valores,editar){
 const tr=document.createElement('tr');
 valores.forEach(v=>{const c=document.createElement('td');c.textContent=v==null?'':String(v);tr.appendChild(c);});
 const c=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='Editar';b.onclick=editar;c.appendChild(b);tr.appendChild(c);
 return tr;
}
const hora=t=>String(t||'').slice(0,5);

async function carregar(){
 const c=await client();
 const [a,b,d]=await Promise.all([
  c.from('tipos_posto').select('id,nome').eq('ativo',true).order('nome'),
  c.from('equipes_postos').select('*').order('codigo'),
  c.from('equipes_escalas').select('*').order('nome')]);
 for(const r of [a,b,d])if(r.error)throw r.error;
 tipos=a.data||[];postos=b.data||[];escalas=d.data||[];
 const pf=$('postos-form'),ef=$('escalas-form');
 pf.elements.tipo_posto_id.replaceChildren(option('','Selecione'),...tipos.map(t=>option(t.id,t.nome)));
 ef.elements.posto_id.replaceChildren(option('','Selecione'),...postos.map(p=>option(p.id,p.codigo)));
 $('postos-lista').replaceChildren(...postos.map(p=>{
  const tr=linha([p.codigo,p.trecho,(tipos.find(t=>t.id===p.tipo_posto_id)||{}).nome,p.status,p.login],
   ()=>{Object.keys(p).forEach(k=>{if(pf.elements[k])pf.elements[k].value=p[k]??'';});pf.scrollIntoView({behavior:'smooth'});});
  const c=document.createElement('td');c.dataset.acesso=p.login;c.textContent='Conferindo…';
  tr.insertBefore(c,tr.lastChild);return tr;}));
 carregarContas();
 $('escalas-lista').replaceChildren(...escalas.map(e=>linha(
  [(postos.find(p=>p.id===e.posto_id)||{}).codigo,e.nome,hora(e.inicio)+'–'+hora(e.fim),e.efetivo_esperado,e.exige_veiculo?'Sim':'Não',(e.dias_semana||[]).map(x=>DIAS[x]).join(', ')],
  ()=>{Object.keys(e).forEach(k=>{if(ef.elements[k]&&k!=='dias_semana')ef.elements[k].value=e[k]===null?'':typeof e[k]==='boolean'?String(e[k]):(k==='inicio'||k==='fim')?hora(e[k]):e[k];});
   ef.querySelectorAll('[name=dia]').forEach(x=>x.checked=(e.dias_semana||[]).includes(Number(x.value)));ef.scrollIntoView({behavior:'smooth'});})));
}

// ---------- acesso ao app (função gerenciar-acesso-posto) ----------
async function chamarAcesso(corpo){
 const c=await client();
 const {data,error}=await c.functions.invoke('gerenciar-acesso-posto',{body:corpo});
 if(error){
  // a mensagem da função vem no corpo da resposta
  let texto=error.message;
  try{const j=await error.context?.json?.();if(j?.erro)texto=j.erro;}catch(_){}
  if(/Failed to send|fetch/i.test(texto))texto='Não foi possível falar com a função gerenciar-acesso-posto. Confira se ela foi publicada no Supabase.';
  throw Error(texto);
 }
 return data;
}
async function carregarContas(){
 contasErro=null;
 try{const r=await chamarAcesso({acao:'situacao',logins:postos.map(p=>p.login)});contas=r?.contas||{};}
 catch(e){contas={};contasErro=e.message;msg('Acesso ao app indisponível: '+e.message,true);}
 desenharContas();
}
function desenharContas(){
 document.querySelectorAll('[data-acesso]').forEach(td=>{
  const login=td.dataset.acesso,p=postos.find(x=>x.login===login),k=contas[login];
  td.replaceChildren();
  const txt=document.createElement('span');
  const b=document.createElement('button');b.type='button';
  if(contasErro){txt.textContent='Indisponível';txt.title=contasErro;td.appendChild(txt);return;}
  if(!k||!k.existe){txt.textContent='Sem acesso ';txt.className='ccs-acesso-falta';b.textContent='Criar acesso';b.onclick=()=>abrirJanela(p,'criar');}
  else{
   const avisos=[!k.email_certo&&'e-mail diferente do padrão',!k.confirmado&&'e-mail não confirmado',!k.ativo&&'perfil inativo'].filter(Boolean);
   txt.textContent=avisos.length?'Com acesso ('+avisos.join(', ')+') ':'Com acesso ';
   txt.className=avisos.length?'ccs-acesso-falta':'ccs-acesso-ok';
   txt.title=k.email||'';
   b.textContent='Redefinir senha';b.onclick=()=>abrirJanela(p,'redefinir');
  }
  td.append(txt,b);
 });
}
let janelaAcao=null,janelaPosto=null;
function abrirJanela(posto,acao){
 janelaAcao=acao;janelaPosto=posto;
 const f=$('acesso-form');f.reset();$('acesso-erro').textContent='';
 f.elements.senha.type=f.elements.senha2.type='password';
 $('acesso-titulo').textContent=(acao==='criar'?'Criar acesso · ':'Redefinir senha · ')+posto.codigo;
 $('acesso-info').textContent='Login no app: '+posto.login+(acao==='redefinir'?'. A senha atual deixa de valer.':'');
 $('acesso-janela').hidden=false;f.elements.senha.focus();
}
function fecharJanela(){const f=$('acesso-form');f.reset();$('acesso-janela').hidden=true;janelaAcao=janelaPosto=null;}
function ligarJanela(){
 const f=$('acesso-form');
 $('acesso-cancelar').onclick=fecharJanela;
 $('acesso-janela').addEventListener('keydown',e=>{if(e.key==='Escape')fecharJanela();});
 $('acesso-mostrar').onchange=e=>{f.elements.senha.type=f.elements.senha2.type=e.target.checked?'text':'password';};
 f.onsubmit=async ev=>{
  ev.preventDefault();
  const senha=f.elements.senha.value,senha2=f.elements.senha2.value;
  if(senha!==senha2){$('acesso-erro').textContent='As senhas não conferem.';return;}
  if(senha.length<8||!/[A-Za-z]/.test(senha)||!/\d/.test(senha)){$('acesso-erro').textContent='Use pelo menos 8 caracteres, com letras e números.';return;}
  const botao=$('acesso-salvar');botao.disabled=true;$('acesso-erro').textContent='';
  try{
   const r=await chamarAcesso({acao:janelaAcao,login:janelaPosto.login,senha});
   fecharJanela();msg(r?.mensagem||'Acesso atualizado.');await carregarContas();
  }catch(e){$('acesso-erro').textContent=e.message;}
  finally{botao.disabled=false;}
 };
}

function ligarFormularios(){
 const pf=$('postos-form'),ef=$('escalas-form');
 const limparPosto=()=>{pf.reset();pf.elements.id.value='';};
 const limparEscala=()=>{ef.reset();ef.elements.id.value='';ef.elements.vigente_desde.value=new Date().toLocaleDateString('en-CA');};
 $('postos-novo').onclick=limparPosto;$('escalas-nova').onclick=limparEscala;limparEscala();
 pf.onsubmit=async ev=>{
  ev.preventDefault();const d=Object.fromEntries(new FormData(pf).entries()),id=d.id;delete d.id;
  d.codigo=d.codigo.trim().toUpperCase();d.login=d.login.trim().toLowerCase();
  const c=await client(),r=id?await c.from('equipes_postos').update(d).eq('id',id):await c.from('equipes_postos').insert(d);
  if(r.error){msg('Não foi possível salvar o posto: '+r.error.message,true);return;}
  limparPosto();try{await carregar();msg('Posto salvo. Se o posto ainda não tem acesso ao app, use "Criar acesso" na lista.');}catch(e){msg(e.message,true);}
 };
 ef.onsubmit=async ev=>{
  ev.preventDefault();const d=Object.fromEntries(new FormData(ef).entries()),id=d.id;delete d.id;delete d.dia;
  d.dias_semana=[...ef.querySelectorAll('[name=dia]:checked')].map(x=>Number(x.value));
  if(!d.dias_semana.length){msg('Selecione pelo menos um dia da semana.',true);return;}
  d.efetivo_esperado=Number(d.efetivo_esperado);d.tolerancia_min=Number(d.tolerancia_min);
  for(const k of ['exige_veiculo','exige_efetivo','ativo'])d[k]=d[k]==='true';
  if(!d.vigente_ate)d.vigente_ate=null;
  const c=await client(),r=id?await c.from('equipes_escalas').update(d).eq('id',id):await c.from('equipes_escalas').insert(d);
  if(r.error){msg('Não foi possível salvar a escala: '+r.error.message,true);return;}
  limparEscala();try{await carregar();msg('Escala salva.');}catch(e){msg(e.message,true);}
 };
}

async function iniciar(){
 const conteudo=$('postos-conteudo');conteudo.hidden=true;msg('Carregando...');
 try{
  const c=await client();
  const {data:{user},error:authErr}=await c.auth.getUser();
  if(authErr||!user)throw Error('Sessão não encontrada. Entre novamente na Central para gerir postos.');
  const {data:perfil,error:perfilErr}=await c.from('perfis').select('perfil,ativo').eq('id',user.id).maybeSingle();
  if(perfilErr)throw perfilErr;
  if(!perfil||!perfil.ativo||perfil.perfil!=='admin')throw Error('Acesso restrito ao administrador ativo.');
  await carregar();
  conteudo.hidden=false;msg(postos.length+' posto(s) e '+escalas.length+' escala(s) cadastrados.');
 }catch(e){msg(e.message||String(e),true);}
}

function show(){
 if(root())return;
 const el=document.createElement('div');el.id='postos-overlay';el.className='ccs-modulo';
 document.body.appendChild(el);layout();ligarFormularios();ligarJanela();iniciar();
}
window.SecurityPostos={show,close};
})();
