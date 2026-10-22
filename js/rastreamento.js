(function(){
  'use strict';
  let map=null,timer=null,client=null,positions=[],filter='TODOS',query='',modalCleanup=null,loadingMap=null;
  const config=window.PAINEL_CONFIG||{};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadLeaflet(){
    if(window.L)return Promise.resolve();
    if(loadingMap)return loadingMap;
    loadingMap=new Promise((resolve,reject)=>{
      if(!document.getElementById('tracking-leaflet-css')){const l=document.createElement('link');l.id='tracking-leaflet-css';l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(l);}
      const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=resolve;script.onerror=()=>reject(Error('Falha ao carregar Leaflet.'));document.head.appendChild(script);
    }).catch(err=>{loadingMap=null;throw err});
    return loadingMap;
  }
  async function getClient(){
    if(client)return client;
    if(!config.SUPABASE_URL||!config.SUPABASE_ANON_KEY)throw Error('Configure Supabase no painel para consultar posições reais.');
    if(!window.supabase)await new Promise((ok,fail)=>{const tag=document.createElement('script');tag.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';tag.onload=ok;tag.onerror=fail;document.head.appendChild(tag);});
    client=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
    return client;
  }
  function formatTime(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}
  function state(p){return String(p.status_conexao||'OFFLINE').toUpperCase()==='ONLINE'?'ONLINE':'OFFLINE'}
  function filtered(){return positions.filter(p=>(filter==='TODOS'||state(p)===filter)&&(!query||String(p.equipe||p.dispositivo_id||'').toLowerCase().includes(query)))}
  function draw(){
    
    const arr=filtered(),online=positions.filter(p=>state(p)==='ONLINE').length,offline=positions.length-online;
    document.getElementById('gps-total').textContent=positions.length;
    document.getElementById('gps-online').textContent=online;
    document.getElementById('gps-offline').textContent=offline;
    document.getElementById('gps-visible').textContent=arr.length;
    const rows=arr.map(p=>{
      const key=String(p.dispositivo_id||p.equipe||''),label=esc(p.equipe||'Equipe sem identificação'),con=state(p),bat=p.bateria_percentual==null?'—':esc(p.bateria_percentual)+'%',valid=Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&Math.abs(Number(p.latitude))<=90&&Math.abs(Number(p.longitude))<=180&&p.latitude!=null&&p.longitude!=null;

      return '<tr><td><strong>'+label+'</strong></td><td><span class="gps-pill '+(con==='ONLINE'?'gps-ok':'gps-off')+'">'+con+'</span></td><td>'+bat+(p.carregando?' ⚡':'')+'</td><td>'+esc(formatTime(p.coletado_em))+'</td><td>'+esc(p.modo||'—')+'</td><td><button type="button" class="gps-locate" data-gps-id="'+esc(key)+'" '+(!valid?'disabled title="Sem coordenadas válidas"':'')+'>Localizar</button></td></tr>';
    });
    document.getElementById('gps-teams').innerHTML=rows.join('')||'<tr><td colspan="6" class="gps-empty">Nenhuma equipe encontrada com estes filtros.</td></tr>';
    document.getElementById('gps-teams').querySelectorAll('[data-gps-id]').forEach(btn=>btn.onclick=()=>{
      const item=arr.find(x=>String(x.dispositivo_id||x.equipe||'')===btn.dataset.gpsId);
      if(item)openMap(item).catch(error=>{document.getElementById('gps-status').textContent='Erro ao localizar: '+error.message});
    });
  }
  async function refresh(){
    const status=document.getElementById('gps-status');if(!status)return;
    status.textContent='Atualizando posições...';
    try{
      const sb=await getClient(),auth=await sb.auth.getUser();if(!auth.data?.user)throw Error('Entre no painel para visualizar o rastreamento.');
      const result=await sb.from('rastreamento_painel').select('dispositivo_id,equipe,turno_ativo,latitude,longitude,coletado_em,recebido_em,bateria_percentual,carregando,precisao_m,modo,status_conexao').order('equipe');
      if(result.error)throw result.error;
      positions=result.data||[];draw();
      status.textContent='Atualizado em '+new Date().toLocaleTimeString('pt-BR')+' · atualização automática a cada 20 segundos';
    }catch(error){status.textContent='Não foi possível atualizar: '+(error.message||error);}
  }
  function closeMap(){
    if(modalCleanup){document.removeEventListener('keydown',modalCleanup);modalCleanup=null;}
    if(map){map.remove();map=null}
    document.getElementById('gps-map-modal')?.remove();
  }
  async function openMap(item){
    const lat=Number(item.latitude),lon=Number(item.longitude);
    if(item.latitude==null||item.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Coordenadas inválidas');
    await loadLeaflet();closeMap();
    const modal=document.createElement('div');modal.id='gps-map-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Localização da equipe');
    modal.innerHTML='<section class="gps-map-dialog"><div class="gps-map-top"><strong>Localização · '+esc(item.equipe||'Equipe')+'</strong><button id="gps-map-close" type="button">✕ Fechar</button></div><div id="gps-map"></div><p>Última coleta: '+esc(formatTime(item.coletado_em))+' · Latitude: '+lat.toFixed(6)+' · Longitude: '+lon.toFixed(6)+'</p></section>';
    document.body.appendChild(modal);const previous=document.activeElement;
    const key=e=>{if(e.key==='Escape')dismiss()};
    function dismiss(){closeMap();if(previous?.isConnected)previous.focus()}
    modalCleanup=key;document.addEventListener('keydown',key);modal.querySelector('#gps-map-close').onclick=dismiss;modal.onclick=e=>{if(e.target===modal)dismiss()};
    try{
      map=window.L.map('gps-map').setView([lat,lon],16);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
      window.L.circleMarker([lat,lon],{radius:10,color:state(item)==='ONLINE'?'#168451':'#df8534',weight:3,fillOpacity:.85}).addTo(map).bindPopup(esc(item.equipe||'Equipe')+' · '+esc(state(item))).openPopup();
      requestAnimationFrame(()=>map?.invalidateSize());
      modal.querySelector('#gps-map-close').focus();
    }catch(e){dismiss();throw e}
  }
  async function show(){
    if(document.getElementById('gps-overlay'))return;
    const overlay=document.createElement('div');overlay.id='gps-overlay';
    overlay.innerHTML='<header class="gps-header ccs-module-topbar"><div class="ccs-module-brand"><strong>SECURITY CCS</strong><small>Monitoramento GPS</small></div><div class="ccs-module-actions"><button type="button" id="gps-refresh">Atualizar</button> <button type="button" id="gps-close">Voltar ao painel</button></div></header><main class="gps-main"><div class="gps-intro"><h2>Posicionamento das equipes</h2><p id="gps-status" role="status">Carregando posições...</p></div><div class="gps-cards"><article><span>Equipes monitoradas</span><strong id="gps-total">0</strong></article><article><span>Online</span><strong id="gps-online">0</strong></article><article><span>Offline</span><strong id="gps-offline">0</strong></article><article><span>Visíveis no filtro</span><strong id="gps-visible">0</strong></article></div><div class="gps-layout"><section class="gps-table-card"><h3>Equipes em campo</h3><div class="gps-filters"><input id="gps-search" type="search" placeholder="Pesquisar equipe ou dispositivo" aria-label="Pesquisar equipe"><select id="gps-filter" aria-label="Filtrar conexão"><option value="TODOS">Todas as conexões</option><option value="ONLINE">Online</option><option value="OFFLINE">Offline</option></select></div><div class="r-table-wrap gps-scroll"><table class="r-table"><thead><tr><th>Equipe</th><th>Conexão</th><th>Bateria</th><th>Última coleta</th><th>Modo</th><th>Ação</th></tr></thead><tbody id="gps-teams"></tbody></table></div></section></div></main>';
    if(!document.getElementById('gps-styles')){const css=document.createElement('style');css.id='gps-styles';css.textContent=`
#gps-overlay{position:fixed;inset:0;z-index:10000;overflow:auto;background:#f3f6fa;color:#0b2942;font:14px Inter,system-ui,sans-serif}#gps-overlay *{box-sizing:border-box}
#gps-overlay .gps-header{background:#0b2942;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
#gps-overlay button{border:0;border-radius:7px;background:#0b2942;color:white;padding:9px 13px;cursor:pointer}#gps-overlay button:disabled{opacity:.45;cursor:not-allowed}
#gps-overlay .gps-header button{background:#24465f}#gps-overlay .gps-main{max-width:1550px;margin:auto;padding:18px}
#gps-overlay .gps-intro h2{margin:0 0 5px}#gps-overlay .gps-intro p{color:#526a80}
#gps-overlay .gps-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}
#gps-overlay .gps-cards article{background:#fff;border:1px solid #dce4eb;border-radius:10px;padding:16px}
#gps-overlay .gps-cards span{display:block;color:#526a80;font-size:12px}#gps-overlay .gps-cards strong{display:block;font-size:27px;margin-top:5px}
#gps-overlay .gps-layout{display:block}
#gps-overlay .gps-map-card,#gps-overlay .gps-table-card{background:white;border:1px solid #dce4eb;border-radius:12px;padding:12px;min-width:0}
#gps-overlay .gps-map-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
#gps-overlay #gps-map{height:clamp(350px,65vh,680px);border-radius:9px;background:#e4e7eb;z-index:0}
#gps-overlay .gps-filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
#gps-overlay .gps-filters input,#gps-overlay .gps-filters select{min-width:140px;flex:1;padding:10px;border:1px solid #bccbd7;border-radius:7px;background:white;color:#0b2942}
#gps-overlay .gps-scroll{overflow:auto;max-height:590px}#gps-overlay .r-table{min-width:540px}
#gps-overlay .r-table th{position:sticky;top:0;background:#0b2942;color:white;z-index:1}#gps-overlay .r-table td{white-space:nowrap}
#gps-overlay .gps-pill{display:inline-block;padding:5px 9px;border-radius:15px;font-size:11px;font-weight:700}
#gps-overlay .gps-ok{background:#dff4e8;color:#17643c}#gps-overlay .gps-off{background:#fce8df;color:#985126}
#gps-overlay .gps-empty{text-align:center;padding:20px}
@media(max-width:1050px){#gps-overlay .gps-layout{grid-template-columns:1fr}}@media(max-width:650px){#gps-overlay .gps-cards{grid-template-columns:repeat(2,minmax(0,1fr))}#gps-overlay .gps-main{padding:12px}}
`;document.head.appendChild(css)}
    if(!document.getElementById('gps-map-modal-css')){const modalCss=document.createElement('style');modalCss.id='gps-map-modal-css';modalCss.textContent=`
#gps-map-modal{position:fixed;inset:0;z-index:20000;background:#061b2de8;display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}
#gps-map-modal .gps-map-dialog{width:min(1000px,100%);max-height:94vh;overflow:auto;background:#fff;color:#0b2942;padding:16px;border-radius:14px;box-sizing:border-box}
#gps-map-modal .gps-map-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
#gps-map-modal button{background:#0b2942;color:#fff;border:0;border-radius:7px;padding:9px 13px;cursor:pointer}
#gps-map-modal #gps-map{height:clamp(320px,65vh,650px);border-radius:8px}
`;document.head.appendChild(modalCss);}
    document.body.appendChild(overlay);
    document.getElementById('gps-close').onclick=close;
    document.getElementById('gps-refresh').onclick=refresh;
    document.getElementById('gps-search').oninput=e=>{query=e.target.value.trim().toLowerCase();draw()};
    document.getElementById('gps-filter').onchange=e=>{filter=e.target.value;draw()};

    await refresh();timer=setInterval(refresh,20000);
  }
  function close(){if(timer)clearInterval(timer);timer=null;closeMap();positions=[];filter='TODOS';query='';document.getElementById('gps-overlay')?.remove();}
  window.SecurityTrackingMap={show,close};
})();
