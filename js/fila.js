/* Fila de envio do painel de campo.
   Cada registro feito pelo campo é guardado no aparelho (IndexedDB, com as fotos) ANTES de ir para o servidor.
   Só sai da fila quando o servidor confirma. Se o aparelho não permitir armazenamento local
   (aba anônima, por exemplo), a fila funciona só na memória e o painel avisa para não fechar a página. */
(function () {
  'use strict';
  var NOME = 'security-rumo-campo', LOJA = 'fila';
  var memoria = [], dbp = null, persistente = true;

  function abrir() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        if (!window.indexedDB) { persistente = false; return res(null); }
        var rq = window.indexedDB.open(NOME, 1);
        rq.onupgradeneeded = function () {
          var d = rq.result;
          if (!d.objectStoreNames.contains(LOJA)) { var st = d.createObjectStore(LOJA, { keyPath: 'clientId' }); st.createIndex('usuarioId', 'usuarioId', { unique: false }); }
        };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { persistente = false; res(null); };
        rq.onblocked = function () { persistente = false; res(null); };
      } catch (e) { persistente = false; res(null); }
    });
    return dbp;
  }
  function tx(modo, fn) {
    return abrir().then(function (d) {
      if (!d) { var o = fn(null); return o && o.result !== undefined ? o.result : o; }
      return new Promise(function (res, rej) {
        var t = d.transaction(LOJA, modo), st = t.objectStore(LOJA), out;
        try { out = fn(st); } catch (e) { rej(e); return; }
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  window.PainelFila = {
    get persistente() { return persistente; },
    iniciar: function () { return abrir().then(function () { return persistente; }); },
    adicionar: function (item) {
      return tx('readwrite', function (st) { if (!st) { memoria.push(item); return; } return st.put(item); });
    },
    listar: function (usuarioId) {
      return tx('readonly', function (st) {
        if (!st) return { result: memoria.filter(function (i) { return i.usuarioId === usuarioId; }).sort(function (a, b) { return a.criadoEm - b.criadoEm; }) };
        var rq = st.index('usuarioId').getAll(usuarioId); return rq;
      }).then(function (l) { return (l || []).slice().sort(function (a, b) { return a.criadoEm - b.criadoEm; }); });
    },
    atualizar: function (clientId, patch) {
      return tx('readwrite', function (st) {
        if (!st) { memoria.forEach(function (i) { if (i.clientId === clientId) Object.assign(i, patch); }); return; }
        var g = st.get(clientId); g.onsuccess = function () { if (g.result) st.put(Object.assign(g.result, patch)); };
      });
    },
    remover: function (clientId) {
      return tx('readwrite', function (st) {
        if (!st) { memoria = memoria.filter(function (i) { return i.clientId !== clientId; }); return; }
        return st.delete(clientId);
      });
    }
  };
})();
