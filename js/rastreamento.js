(function(){
  'use strict';
  let map=null,layer=null,timer=null,client=null;
  const config=window.PAINEL_CONFIG||{};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadLeaflet(){
    if(window.L)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      if(!document.getElementById('tracking-leaflet-css')){
        const css=document.createElement('link');css.id='tracking-leaflet-css';css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(css);
      }
      const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.onload=resolve;js.onerror=()=>reject(Error('Falha ao carregar mapa'));document.head.appendChild(js);
    });
  }
  async function getClient(){
    if(client)return client;
    if(!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY)throw Error('Configure Supabase no painel para consultar posições reais.');
    if(!window.supabase)throw Error('Cliente Supabase ainda não carregado.');
    client=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
    return client;
  }
  async function refresh(){
    const status=document.getElementById('gps-status');if(!status)return;
    try{
      const sb=await getClient(),{data:{user}}=await sb.auth.getUser();
      if(!user)throw Error('Entre no painel para visualizar o rastreamento.');
      const {data,error}=await sb.from('rastreamento_painel').select('dispositivo_id,equipe,turno_ativo,latitude,longitude,coletado_em,recebido_em,bateria_percentual,carregando,precisao_m,modo,status_conexao').order('equipe');
      if(error)throw error;
      layer.clearLayers();
      const markers=[],rows=[];
      (data||[]).forEach(p=>{
        const valid=Number.isFinite(p.latitude)&&Number.isFinite(p.longitude);
        const label=esc(p.equipe||'Equipe sem nome'),bat=p.bateria_percentual==null?'—':p.bateria_percentual+'%',stamp=p.coletado_em?new Date(p.coletado_em).toLocaleString('pt-BR'):'—';
        rows.push('<tr><td>'+label+'</td><td>'+esc(p.status_conexao)+'</td><td>'+esc(bat)+(p.carregando?' ⚡':'')+'</td><td>'+esc(stamp)+'</td><td>'+esc(p.modo||'—')+'</td></tr>');
        if(!valid)return;
        const marker=window.L.circleMarker([p.latitude,p.longitude],{radius:9,color:p.status_conexao==='ONLINE'?'#198754':'#F58220',fillOpacity:.85}).addTo(layer);
        marker.bindPopup('<strong>'+label+'</strong><p>Status: '+esc(p.status_conexao)+'<br>Bateria: '+esc(bat)+'<br>Atualização: '+esc(stamp)+'<br>Precisão: '+esc(p.precisao_m??'—')+' m</p>');
        markers.push(marker);
      });
      document.getElementById('gps-teams').innerHTML=rows.join('')||'<tr><td colspan="5">Nenhum dispositivo cadastrado.</td></tr>';
      if(markers.length&&!map._trackingFitted){map.fitBounds(window.L.featureGroup(markers).getBounds().pad(.25),{maxZoom:15});map._trackingFitted=true;}
      status.textContent=(data||[]).length+' equipe(s) • '+(data||[]).filter(x=>x.status_conexao==='ONLINE').length+' online • atualizado '+new Date().toLocaleTimeString('pt-BR');
    }catch(e){status.textContent='Erro: '+(e.message||e);}
  }
  async function show(){
    if(document.getElementById('gps-overlay'))return;
    const overlay=document.createElement('div');overlay.id='gps-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:#f4f6f8;color:#0B2942;overflow:auto;font-family:Inter,system-ui,sans-serif';
    overlay.innerHTML='<header style="background:#0B2942;color:white;padding:15px 20px;display:flex;justify-content:space-between;gap:12px;align-items:center"><strong>SECURITY RUMO · Rastreamento GPS</strong><button type="button" id="gps-close" style="padding:9px;border-radius:8px;border:0">Voltar ao painel</button></header><main style="max-width:1400px;margin:auto;padding:16px"><p id="gps-status" role="status">Carregando posições...</p><div id="gps-map" style="height:min(65vh,620px);min-height:320px;border-radius:12px;background:#e4e7eb"></div><h3>Equipes em campo</h3><div style="overflow-x:auto"><table style="width:100%;text-align:left;border-spacing:0 12px"><thead><tr><th>Equipe</th><th>Conexão</th><th>Bateria</th><th>Última coleta</th><th>Modo</th></tr></thead><tbody id="gps-teams"></tbody></table></div></main>';
    document.body.appendChild(overlay);
    document.getElementById('gps-close').onclick=close;
    try{
      await loadLeaflet();
      map=window.L.map('gps-map').setView([-23.9,-46.4],10);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
      layer=window.L.layerGroup().addTo(map);
      await refresh();timer=setInterval(refresh,20000);
    }catch(e){document.getElementById('gps-status').textContent='Mapa indisponível: '+e.message;}
  }
  function close(){if(timer)clearInterval(timer);timer=null;if(map)map.remove();map=null;layer=null;document.getElementById('gps-overlay')?.remove();}
  window.SecurityTrackingMap={show,close};
})();
