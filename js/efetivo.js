(function () {
  'use strict';
  const C = window.PAINEL_CONFIG || {};
  let client = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function supabase() {
    if (!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY)) throw Error('Configure o Supabase no painel.');
    if (!window.supabase) {
      await new Promise((ok, fail) => {
        const el = document.createElement('script');
        el.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
        el.onload = ok; el.onerror = fail; document.head.appendChild(el);
      });
    }
    if (!client) client = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    return client;
  }
  async function refresh() {
    const body = document.querySelector('#efetivo-tbody');
    const status = document.querySelector('#efetivo-status');
    if (!body || !status) return;
    try {
      const sb = await supabase();
      const auth = await sb.auth.getUser();
      if (!auth.data.user) throw Error('Entre no painel para consultar o efetivo.');
      const result = await sb.from('efetivo_turno')
        .select('equipe,matricula,nome,turno_chave,registrado_em,foto_path')
        .order('registrado_em', {ascending:false}).limit(200);
      if (result.error) throw result.error;
      const entries = result.data || [];
      body.innerHTML = entries.map((r, i) =>
        '<tr><td>'+esc(r.equipe)+'</td><td>'+esc(r.matricula)+'</td><td>'+esc(r.nome)+'</td><td>'+esc(r.turno_chave)+'</td><td>'+esc(new Date(r.registrado_em).toLocaleString('pt-BR'))+'</td><td><button type="button" data-selfie-index="'+i+'" style="border:0;border-radius:6px;padding:7px 10px;background:#0B2942;color:white;cursor:pointer">Ver selfie</button></td></tr>').join('')
        || '<tr><td colspan="6">Nenhum agente registrado.</td></tr>';
      body.onclick = async (event) => {
        const b = event.target.closest('[data-selfie-index]');
        if (!b) return;
        const index = Number(b.dataset.selfieIndex);
        if (!Number.isInteger(index) || !entries[index]) return;
        b.disabled = true;
        try {
          const photo = await sb.storage.from('efetivo-selfies')
            .createSignedUrl(entries[index].foto_path, 120);
          if (photo.error) throw photo.error;
          const photoBox = document.querySelector('#efetivo-photo');
          photoBox.innerHTML = '<div style="margin:12px 0"><strong>'+esc(entries[index].nome)+'</strong> <button type="button" id="efetivo-photo-close">Fechar foto</button><div><img alt="Selfie do agente" style="margin-top:8px;max-height:68vh;max-width:100%;border-radius:10px" src="'+esc(photo.data.signedUrl)+'"></div></div>';
          document.querySelector('#efetivo-photo-close').onclick = () => {photoBox.innerHTML = '';};
        } catch (e) {
          status.textContent = 'Falha ao abrir selfie: ' + (e.message || e);
        } finally {b.disabled = false;}
      };
      status.textContent = entries.length + ' registro(s) exibidos · Última consulta ' + new Date().toLocaleTimeString('pt-BR');
    } catch (e) {status.textContent = 'Não foi possível carregar o efetivo: '+(e.message || e);}
  }
  function show() {
    if (document.getElementById('efetivo-overlay')) return;
    const root = document.createElement('div');
    root.id = 'efetivo-overlay';
    root.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#f4f6f8;color:#0B2942;overflow:auto;font-family:Inter,system-ui,sans-serif';
    root.innerHTML = '<header style="padding:14px 20px;background:#0B2942;color:white;display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>SECURITY RUMO · Efetivo no Turno</strong><button id="efetivo-close" style="padding:8px;border-radius:7px;border:0">Voltar ao painel</button></header><main style="max-width:1300px;margin:auto;padding:18px"><p id="efetivo-status" role="status">Carregando...</p><button type="button" id="efetivo-refresh">Atualizar registros</button><div style="overflow-x:auto"><table style="width:100%;border-spacing:0 12px;text-align:left"><thead><tr><th>Equipe</th><th>Matrícula</th><th>Agente</th><th>Turno</th><th>Data/hora</th><th>Foto</th></tr></thead><tbody id="efetivo-tbody"></tbody></table></div><section id="efetivo-photo"></section></main>';
    document.body.appendChild(root);
    document.getElementById('efetivo-close').onclick = () => root.remove();
    document.getElementById('efetivo-refresh').onclick = refresh;
    refresh();
  }
  window.SecurityEfetivo = {show};
})();
