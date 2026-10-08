<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ranking · Canteiro Seguro</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css?v=<?= @filemtime(__DIR__ . '/assets/style.css') ?>">
</head>
<body class="pagina-ranking">
  <header class="rk-topo">
    <div>
      <div class="rk-selo">SIPAT · Canteiro Seguro</div>
      <h1>🏆 Ranking</h1>
    </div>
    <a class="btn btn-amarelo" href="./">▶ Jogar</a>
  </header>
  <div class="rk-filtro">
    <select id="obra" aria-label="Filtrar por obra"><option value="">Todas as obras</option></select>
    <span id="resumo"></span>
  </div>
  <ol id="lista" class="rk-lista"><li class="rk-vazio">Carregando…</li></ol>
  <p class="rk-nota">Vale a melhor partida de cada pessoa. Empate: quem fez em menos tempo. Atualiza sozinho a cada 30 segundos.</p>
  <p class="rk-nota" id="nota-demo" hidden>Versão de demonstração: este ranking mostra só as partidas feitas neste aparelho.</p>
<script src="assets/demo.js"></script>
<script>
if (window.SIPAT_DEMO) document.getElementById('nota-demo').hidden = false;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bonito = n => n.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, c => c.toLocaleUpperCase('pt-BR'));
let obrasCarregadas = false;
async function carregar() {
  try {
    const obra = $('#obra').value;
    const d = window.SIPAT_DEMO ? SipatDemo.ranking(obra)
      : await fetch('api.php?action=ranking&obra=' + encodeURIComponent(obra)).then(r => r.json());
    if (!obrasCarregadas) {
      d.obras.forEach(o => $('#obra').insertAdjacentHTML('beforeend', `<option>${esc(o)}</option>`));
      obrasCarregadas = true;
      try { const salvo = localStorage.getItem('sipat_rk_obra'); if (salvo && d.obras.includes(salvo)) { $('#obra').value = salvo; return carregar(); } } catch (e) {}
    }
    $('#resumo').textContent = `${d.jogadores} participante(s)`;
    const medalha = p => ['🥇', '🥈', '🥉'][p - 1] || p + 'º';
    $('#lista').innerHTML = d.ranking.length ? d.ranking.map(x => `
      <li class="${x.posicao <= 3 ? 'podio' : ''}">
        <span class="pos">${medalha(x.posicao)}</span>
        <span class="quem"><b>${esc(bonito(x.nome))}</b><small>${esc(x.obra)}</small></span>
        <span class="pts">${x.pontos}</span>
      </li>`).join('') : '<li class="rk-vazio">Ninguém jogou ainda. Seja o primeiro!</li>';
  } catch (e) {
    $('#resumo').textContent = 'Sem conexão, tentando de novo…';
  }
}
$('#obra').onchange = () => { try { localStorage.setItem('sipat_rk_obra', $('#obra').value); } catch (e) {} carregar(); };
carregar();
setInterval(carregar, 30000);
</script>
</body>
</html>
