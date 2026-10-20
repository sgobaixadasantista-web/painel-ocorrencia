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
async function refresh(){
 const tbody=document.getElementById('veiculos-tbody'),status=document.getElementById('veiculos-status');
 if(!tbody)return;
 try{
  const sb=await getClient();
  const {data:{user}}=await sb.auth.getUser();if(!user)throw Error('Entre no painel.');
  const {data,error}=await sb.from('veiculo_turno').select('equipe,placa,odometro_km,turno_chave,registrado_em,foto_placa_path,foto_odometro_path').order('registrado_em',{ascending:false}).limit(200);
  if(error)throw error;
  const rows=data||[];
  tbody.innerHTML=rows.map((v,i)=>'<tr><td>'+esc(v.equipe)+'</td><td>'+esc(v.placa)+'</td><td>'+esc(v.odometro_km==null?'—':v.odometro_km+' km')+'</td><td>'+esc(v.turno_chave)+'</td><td>'+esc(new Date(v.registrado_em).toLocaleString('pt-BR'))+'</td><td><button type="button" data-vehicle="'+i+'" data-photo="foto_placa_path">Placa</button> <button type="button" data-vehicle="'+i+'" data-photo="foto_odometro_path">Odômetro</button></td></tr>').join('')||'<tr><td colspan="6">Nenhum veículo registrado.</td></tr>';
  tbody.onclick=async ev=>{
   const btn=ev.target.closest('[data-vehicle]');if(!btn)return;
   const item=rows[Number(btn.dataset.vehicle)];if(!item)return;
   btn.disabled=true;
   try{
    const {data,error}=await sb.storage.from('veiculo-turno-fotos').createSignedUrl(item[btn.dataset.photo],120);
    if(error)throw error;
    document.getElementById('veiculos-foto').innerHTML='<p><strong>'+esc(item.placa)+'</strong> <button id="veiculos-fechar-foto">Fechar foto</button></p><img alt="Foto do veículo" src="'+esc(data.signedUrl)+'" style="max-height:65vh;max-width:100%;border-radius:10px">';
    document.getElementById('veiculos-fechar-foto').onclick=()=>document.getElementById('veiculos-foto').innerHTML='';
   }catch(e){status.textContent='Não foi possível abrir a foto: '+(e.message||e);}
   finally{btn.disabled=false;}
  };
  status.textContent=rows.length+' veículo(s) listado(s) · Atualizado '+new Date().toLocaleTimeString('pt-BR');
 }catch(e){status.textContent='Erro ao consultar veículos: '+(e.message||e);}
}
function show(){
 if(document.getElementById('veiculos-overlay'))return;
 const root=document.createElement('div');root.id='veiculos-overlay';root.style.cssText='position:fixed;inset:0;z-index:10001;overflow:auto;background:#f4f6f8;color:#0B2942;font-family:Inter,system-ui,sans-serif';
 root.innerHTML='<header style="padding:15px 20px;display:flex;justify-content:space-between;background:#0B2942;color:white"><strong>SECURITY RUMO · Veículos no Turno</strong><button id="veiculos-voltar">Voltar ao painel</button></header><main style="max-width:1300px;margin:auto;padding:18px"><p id="veiculos-status">Carregando...</p><button id="veiculos-atualizar">Atualizar</button><div style="overflow-x:auto"><table style="width:100%;border-spacing:0 12px;text-align:left"><thead><tr><th>Equipe</th><th>Placa</th><th>Odômetro</th><th>Turno</th><th>Data/hora</th><th>Fotos</th></tr></thead><tbody id="veiculos-tbody"></tbody></table></div><section id="veiculos-foto"></section></main>';
 document.body.appendChild(root);
 document.getElementById('veiculos-voltar').onclick=()=>root.remove();
 document.getElementById('veiculos-atualizar').onclick=refresh;
 refresh();
}
window.SecurityVeiculos={show};
})();