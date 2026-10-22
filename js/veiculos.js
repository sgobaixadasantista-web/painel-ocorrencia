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
    const photos=[['foto_placa_path','Placa'],['foto_odometro_path','Odômetro']];
    const images=(await Promise.all(photos.map(async ([field,label])=>{
      if(!item[field])return null;
      const result=await sb.storage.from('veiculo-turno-fotos').createSignedUrl(item[field],600);
      return result.error?null:{label,url:result.data.signedUrl};
    }))).filter(Boolean);
    if(!images.length)throw Error('Nenhuma foto disponível neste registro.');
    const area=document.getElementById('veiculos-foto');let pos=Math.max(0,images.findIndex(p=>p.label===(btn.dataset.photo==='foto_placa_path'?'Placa':'Odômetro')));
    area.innerHTML='<section style="background:white;border-radius:12px;padding:14px;margin-top:18px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><h3>Galeria · '+esc(item.placa)+'</h3><button id="veiculos-fechar-foto">Fechar</button></div><div style="display:flex;align-items:center;gap:10px;background:#0b2942;border-radius:8px;padding:12px"><button id="veiculos-anterior" aria-label="Foto anterior">‹</button><figure style="flex:1;min-width:0;text-align:center;color:white;margin:0"><img id="veiculos-foto-grande" alt="" style="max-width:100%;max-height:65vh;object-fit:contain;border-radius:7px"><figcaption id="veiculos-legenda"></figcaption></figure><button id="veiculos-proxima" aria-label="Próxima foto">›</button></div><div id="veiculos-miniaturas" style="display:flex;gap:8px;margin-top:12px;overflow-x:auto"></div></section>';
    const img=area.querySelector('#veiculos-foto-grande'),title=area.querySelector('#veiculos-legenda'),thumb=area.querySelector('#veiculos-miniaturas');
    thumb.innerHTML=images.map((p,n)=>'<button type="button" data-thumb="'+n+'" style="background:white;color:#0b2942;border:2px solid #ddd;border-radius:7px;padding:5px;min-width:115px"><img src="'+esc(p.url)+'" alt="'+esc(p.label)+'" style="width:110px;height:72px;object-fit:cover;display:block"><span>'+esc(p.label)+'</span></button>').join('');
    function set(n){pos=(n+images.length)%images.length;img.src=images[pos].url;img.alt=images[pos].label;title.textContent=images[pos].label+' · '+(pos+1)+' de '+images.length;thumb.querySelectorAll('button').forEach((b,i)=>b.style.borderColor=i===pos?'#f58220':'#ddd');}
    area.querySelector('#veiculos-fechar-foto').onclick=()=>area.innerHTML='';
    area.querySelector('#veiculos-anterior').onclick=()=>set(pos-1);
    area.querySelector('#veiculos-proxima').onclick=()=>set(pos+1);
    thumb.querySelectorAll('button').forEach(b=>b.onclick=()=>set(Number(b.dataset.thumb)));
    set(pos);
   }catch(e){status.textContent='Não foi possível abrir a galeria: '+(e.message||e);}
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