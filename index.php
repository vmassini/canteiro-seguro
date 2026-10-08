<?php
// Jogo da SIPAT (Canteiro Seguro). Pagina leve: o jogo todo esta em assets/game.js e o texto das
// placas em assets/conteudo.json. O servidor so guarda a partida e devolve o ranking (api.php).
function v(string $rel): string { $t = @filemtime(__DIR__ . '/' . $rel); return $t ? '?v=' . $t : ''; }
?><!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1f2430">
  <title>Canteiro Seguro · SIPAT</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/style.css<?= v('assets/style.css') ?>">
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
      }
    }
  </script>
</head>
<body class="pagina-jogo">
  <div id="app">
    <header class="hud">
      <div class="hud-item" id="hud-capacetes" title="Capacetes (vidas)"></div>
      <div class="hud-item" title="Pontos">⭐ <b id="hud-pontos">0</b></div>
      <div class="hud-item" title="Placas respondidas">⚠️ <b id="hud-placas">0/8</b></div>
      <div class="hud-item hud-epis" id="hud-epis" title="EPIs que você já pegou"></div>
      <button class="hud-ajuda" id="b-ajuda" aria-label="Como jogar">?</button>
    </header>
    <main id="palco">
      <canvas id="tela"></canvas>
      <div id="flash"></div>
      <div id="toasts" aria-live="polite"></div>
    </main>
    <footer class="missao" id="missao">Toque no chão para andar</footer>
  </div>

  <div id="modal" class="modal" role="dialog" aria-modal="true">
    <div class="modal-caixa" id="modal-conteudo"><p class="sub">Carregando…</p></div>
  </div>

  <script src="assets/demo.js<?= v('assets/demo.js') ?>"></script>
  <script type="module" src="assets/game.js<?= v('assets/game.js') ?>"></script>
</body>
</html>
