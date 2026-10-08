<?php
// Painel do organizador da SIPAT. Uma senha so (hash em includes/segredos.php, ADMIN_SENHA_HASH).
// Mostra resumo, ranking com nome completo (para entregar o premio), partidas, o que o pessoal mais
// erra e a lista de obras. Tudo por formulario simples (POST + redirect), sem JavaScript obrigatorio.
require_once __DIR__ . '/includes/config.php';

$base = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
session_name('SIPATADM');
session_set_cookie_params(['lifetime' => 0, 'path' => $base, 'httponly' => true, 'samesite' => 'Strict',
                           'secure' => !empty($_SERVER['HTTPS'])]);
session_start();

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function voltar(string $aba, string $msg = ''): void {
    $_SESSION['msg'] = $msg;
    header('Location: admin.php?aba=' . urlencode($aba));
    exit;
}
function duracao(int $s): string { return sprintf('%d:%02d', intdiv($s, 60), $s % 60); }

$logado = !empty($_SESSION['admin']);

/* ---------- login / logout ---------- */
if (($_POST['acao'] ?? '') === 'entrar') {
    if (password_verify((string)($_POST['senha'] ?? ''), ADMIN_SENHA_HASH)) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        voltar('resumo');
    }
    sleep(2);   // freia tentativa de adivinhar a senha
    $_SESSION['msg'] = 'Senha incorreta.';
    header('Location: admin.php');
    exit;
}
if (isset($_GET['sair'])) { session_destroy(); header('Location: admin.php'); exit; }

if (!$logado) {
    $msg = $_SESSION['msg'] ?? ''; unset($_SESSION['msg']);
    ?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel · Canteiro Seguro</title><link rel="stylesheet" href="assets/admin.css"></head>
<body class="login"><form method="post" class="caixa">
  <h1>Painel da SIPAT</h1><p>Canteiro Seguro · acesso do organizador</p>
  <?php if ($msg): ?><div class="erro"><?= h($msg) ?></div><?php endif; ?>
  <input type="password" name="senha" placeholder="Senha" autofocus required autocomplete="current-password">
  <input type="hidden" name="acao" value="entrar">
  <button>Entrar</button>
</form></body></html><?php
    exit;
}

/* ---------- logado ---------- */
garantir_tabelas();

// CSV antes de qualquer HTML
if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="sipat-' . ($_GET['csv'] === 'partidas' ? 'partidas' : 'ranking') . '-' . date('Ymd-His') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");   // BOM para o Excel abrir os acentos certo
    if ($_GET['csv'] === 'partidas') {
        fputcsv($out, ['id', 'quando', 'nome', 'obra', 'pontos', 'acertos', 'epis', 'capacetes', 'resultado', 'duracao_seg'], ';');
        foreach (db()->query("SELECT id, criado_em, nome, obra, pontos, acertos, epis, capacetes, resultado, duracao_seg FROM sipat_partida ORDER BY id") as $r) fputcsv($out, $r, ';');
    } else {
        fputcsv($out, ['posicao', 'nome', 'obra', 'pontos', 'duracao', 'quando'], ';');
        foreach (ranking(null, true) as $r) fputcsv($out, [$r['posicao'], $r['nome'], $r['obra'], $r['pontos'], duracao($r['duracao_seg']), $r['quando']], ';');
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'] ?? '', (string)($_POST['csrf'] ?? ''))) voltar('resumo', 'Sessão expirada, tente de novo.');
    $acao = (string)($_POST['acao'] ?? '');
    if ($acao === 'excluir_partida') {
        db()->prepare("DELETE FROM sipat_partida WHERE id = ?")->execute([(int)$_POST['id']]);
        voltar((string)($_POST['aba'] ?? 'partidas'), 'Partida excluída.');
    }
    if ($acao === 'obra_add') {
        $n = trim((string)$_POST['nome']);
        if ($n !== '' && texto_tamanho($n) <= 100) {
            $ordem = (int)db()->query("SELECT COALESCE(MAX(ordem), 0) + 1 FROM sipat_obra")->fetchColumn();
            db()->prepare("INSERT IGNORE INTO sipat_obra (nome, ordem) VALUES (?, ?)")->execute([$n, $ordem]);
        }
        voltar('obras', 'Obra adicionada.');
    }
    if ($acao === 'obra_del') {
        db()->prepare("DELETE FROM sipat_obra WHERE id = ?")->execute([(int)$_POST['id']]);
        voltar('obras', 'Obra removida da lista (as partidas dela continuam no ranking).');
    }
    if ($acao === 'zerar') {
        if (trim((string)$_POST['confirma']) !== 'ZERAR') voltar('resumo', 'Para zerar, digite ZERAR.');
        db()->exec("DELETE FROM sipat_partida");
        voltar('resumo', 'Todas as partidas foram apagadas.');
    }
    voltar('resumo');
}

$aba = $_GET['aba'] ?? 'resumo';
$msg = $_SESSION['msg'] ?? ''; unset($_SESSION['msg']);
$csrf = $_SESSION['csrf'];
$tot = db()->query("SELECT COUNT(*) partidas, COUNT(DISTINCT nome_chave, obra) pessoas, ROUND(AVG(pontos)) media,
                           SUM(DATE(criado_em) = CURDATE()) hoje, MAX(pontos) recorde FROM sipat_partida")->fetch();
$form = fn(string $acao, array $extra = [], string $botao = '', string $classe = '', string $conf = '') =>
    '<form method="post" class="inline"' . ($conf ? ' onsubmit="return confirm(\'' . h($conf) . '\')"' : '') . '>'
    . '<input type="hidden" name="csrf" value="' . h($csrf) . '"><input type="hidden" name="acao" value="' . h($acao) . '">'
    . implode('', array_map(fn($k, $v) => '<input type="hidden" name="' . h($k) . '" value="' . h($v) . '">', array_keys($extra), $extra))
    . '<button class="' . h($classe) . '">' . $botao . '</button></form>';
?><!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel · Canteiro Seguro</title><link rel="stylesheet" href="assets/admin.css"></head>
<body>
<header><strong>Painel da SIPAT · Canteiro Seguro</strong><a href="?sair=1">Sair</a></header>
<nav>
  <?php foreach (['resumo' => 'Resumo', 'ranking' => 'Ranking', 'partidas' => 'Partidas', 'placas' => 'O que mais erram', 'obras' => 'Obras'] as $k => $v): ?>
    <a href="?aba=<?= $k ?>" class="<?= $aba === $k ? 'ativa' : '' ?>"><?= $v ?></a>
  <?php endforeach; ?>
</nav>
<main>
<?php if ($msg): ?><div class="aviso"><?= h($msg) ?></div><?php endif; ?>

<?php if ($aba === 'resumo'): ?>
  <div class="cards">
    <div><span>Partidas</span><b><?= (int)$tot['partidas'] ?></b></div>
    <div><span>Pessoas</span><b><?= (int)$tot['pessoas'] ?></b></div>
    <div><span>Partidas hoje</span><b><?= (int)$tot['hoje'] ?></b></div>
    <div><span>Média de pontos</span><b><?= (int)$tot['media'] ?></b></div>
    <div><span>Recorde</span><b><?= (int)$tot['recorde'] ?></b></div>
  </div>
  <h2>Participação por obra</h2>
  <table><tr><th>Obra</th><th>Pessoas</th><th>Partidas</th><th>Melhor</th></tr>
  <?php foreach (db()->query("SELECT obra, COUNT(DISTINCT nome_chave) pessoas, COUNT(*) partidas, MAX(pontos) melhor FROM sipat_partida GROUP BY obra ORDER BY pessoas DESC, partidas DESC") as $r): ?>
    <tr><td><?= h($r['obra']) ?></td><td><?= (int)$r['pessoas'] ?></td><td><?= (int)$r['partidas'] ?></td><td><?= (int)$r['melhor'] ?></td></tr>
  <?php endforeach; ?></table>
  <h2>Links</h2>
  <p>Jogo: <a href="./" target="_blank"><?= h($base) ?></a> · Ranking público (bom para TV): <a href="ranking.php" target="_blank"><?= h($base) ?>ranking.php</a></p>
  <h2 class="perigo">Zerar tudo</h2>
  <form method="post" class="zerar" onsubmit="return confirm('Apagar TODAS as partidas? Não tem volta.')">
    <input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="acao" value="zerar">
    <input name="confirma" placeholder="digite ZERAR"><button class="perigo">Apagar todas as partidas</button>
  </form>
  <p class="nota">Use antes de abrir para o público, para tirar as partidas de teste.</p>

<?php elseif ($aba === 'ranking'): ?>
  <p><a class="botao" href="?csv=ranking">⬇ Baixar ranking (CSV)</a></p>
  <p class="nota">Melhor partida de cada pessoa (nome + obra). Desempate: menor tempo. O ranking público mostra só primeiro e último nome.</p>
  <table><tr><th>#</th><th>Nome completo</th><th>Obra</th><th>Pontos</th><th>Tempo</th><th>Quando</th><th></th></tr>
  <?php foreach (ranking(null, true) as $r): ?>
    <tr><td><?= $r['posicao'] ?></td><td><?= h($r['nome']) ?></td><td><?= h($r['obra']) ?></td><td><b><?= $r['pontos'] ?></b></td>
      <td><?= duracao($r['duracao_seg']) ?></td><td><?= h(date('d/m H:i', strtotime($r['quando']))) ?></td>
      <td><?= $form('excluir_partida', ['id' => $r['id'], 'aba' => 'ranking'], 'Excluir', 'mini', 'Excluir esta partida do ranking?') ?></td></tr>
  <?php endforeach; ?></table>

<?php elseif ($aba === 'partidas'): ?>
  <p><a class="botao" href="?csv=partidas">⬇ Baixar todas as partidas (CSV)</a></p>
  <table><tr><th>Quando</th><th>Nome</th><th>Obra</th><th>Pontos</th><th>Acertos</th><th>EPIs</th><th>Resultado</th><th>Tempo</th><th></th></tr>
  <?php foreach (db()->query("SELECT * FROM sipat_partida ORDER BY id DESC LIMIT 300") as $r): ?>
    <tr><td><?= h(date('d/m H:i', strtotime($r['criado_em']))) ?></td><td><?= h($r['nome']) ?></td><td><?= h($r['obra']) ?></td>
      <td><b><?= (int)$r['pontos'] ?></b></td><td><?= (int)$r['acertos'] ?>/8</td><td><?= (int)$r['epis'] ?>/4</td>
      <td><?= $r['resultado'] === 'vitoria' ? 'concluiu' : 'perdeu os capacetes' ?></td><td><?= duracao((int)$r['duracao_seg']) ?></td>
      <td><?= $form('excluir_partida', ['id' => $r['id'], 'aba' => 'partidas'], 'Excluir', 'mini', 'Excluir esta partida?') ?></td></tr>
  <?php endforeach; ?></table>

<?php elseif ($aba === 'placas'): ?>
  <?php
    $conteudo = json_decode((string)file_get_contents(__DIR__ . '/assets/conteudo.json'), true);
    $titulos = [];
    foreach (['seguranca' => 'Segurança', 'saude' => 'Saúde'] as $g => $rot) foreach ($conteudo[$g] as $c) $titulos[$c['id']] = [$c['titulo'], $rot];
    $stats = [];
    foreach (db()->query("SELECT respostas FROM sipat_partida") as $r) {
        foreach (json_decode($r['respostas'], true) ?: [] as $x) {
            $stats[$x['id']]['vezes'] = ($stats[$x['id']]['vezes'] ?? 0) + 1;
            $stats[$x['id']]['erros'] = ($stats[$x['id']]['erros'] ?? 0) + ($x['certo'] ? 0 : 1);
        }
    }
    uasort($stats, fn($a, $b) => ($b['erros'] / $b['vezes']) <=> ($a['erros'] / $a['vezes']) ?: $b['vezes'] <=> $a['vezes']);
  ?>
  <p class="nota">Bom para escolher os temas das palestras e do DDS: as situações em que o pessoal mais errou aparecem primeiro.</p>
  <table><tr><th>Situação</th><th>Tema</th><th>Vezes</th><th>Erros</th><th>% de erro</th></tr>
  <?php foreach ($stats as $id => $s): ?>
    <tr><td><?= h($titulos[$id][0] ?? $id) ?></td><td><?= h($titulos[$id][1] ?? '') ?></td><td><?= $s['vezes'] ?></td><td><?= $s['erros'] ?></td>
      <td><b><?= round(100 * $s['erros'] / $s['vezes']) ?>%</b></td></tr>
  <?php endforeach; ?></table>

<?php elseif ($aba === 'obras'): ?>
  <p class="nota">Lista que aparece na tela de entrada do jogo.</p>
  <form method="post" class="inline-add"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="acao" value="obra_add">
    <input name="nome" placeholder="Nome da obra" maxlength="100" required><button>Adicionar</button></form>
  <table><tr><th>Obra</th><th></th></tr>
  <?php foreach (db()->query("SELECT id, nome FROM sipat_obra ORDER BY ordem, nome") as $o): ?>
    <tr><td><?= h($o['nome']) ?></td><td><?= $form('obra_del', ['id' => $o['id']], 'Remover', 'mini', 'Remover esta obra da lista?') ?></td></tr>
  <?php endforeach; ?></table>
<?php endif; ?>
</main>
</body></html>
