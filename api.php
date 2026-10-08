<?php
// API publica do jogo: lista de obras, salvar partida e ranking. Corpo JSON {action, ...}.
// Sem login (projeto curto da SIPAT): o servidor so confere se a partida faz sentido e recalcula
// os pontos pelas regras do jogo, para ninguem mandar um placar impossivel.
require_once __DIR__ . '/includes/config.php';
header('Content-Type: application/json; charset=utf-8');
app_capturar_fatal();

function ok(array $d = []): void { echo json_encode(['ok' => true] + $d, JSON_UNESCAPED_UNICODE); exit; }
function falha(string $msg, int $http = 422): void { http_response_code($http); echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE); exit; }

$in = json_decode((string)file_get_contents('php://input'), true) ?: [];
$action = (string)($in['action'] ?? ($_GET['action'] ?? ''));

try {
    garantir_tabelas();   // CREATE IF NOT EXISTS: no primeiro acesso cria tudo, depois nao faz nada
    switch ($action) {
        case 'obras':
            ok(['obras' => obras()]);

        case 'ranking': {
            $obra = trim((string)($in['obra'] ?? ($_GET['obra'] ?? '')));
            $rk = ranking($obra ?: null);
            $total = (int)db()->query("SELECT COUNT(*) FROM sipat_partida")->fetchColumn();
            ok(['ranking' => array_slice($rk, 0, 50), 'jogadores' => count($rk), 'partidas' => $total, 'obras' => obras()]);
        }

        case 'salvar': {
            $nome = preg_replace('/\s+/', ' ', trim((string)($in['nome'] ?? '')));
            $obra = trim((string)($in['obra'] ?? ''));
            if (texto_tamanho($nome) < 5 || texto_tamanho($nome) > 100 || count(explode(' ', $nome)) < 2) falha('Informe o nome completo.');
            if (!in_array($obra, obras(), true)) falha('Escolha uma obra da lista.');

            $acertos = max(0, min(TOTAL_PLACAS, (int)($in['acertos'] ?? 0)));
            $epis = max(0, min(TOTAL_EPIS, (int)($in['epis'] ?? 0)));
            $capacetes = max(0, min(CAPACETES, (int)($in['capacetes'] ?? 0)));
            $resultado = ($in['resultado'] ?? '') === 'vitoria' ? 'vitoria' : 'derrota';
            $duracao = max(0, min(86400, (int)($in['duracao_seg'] ?? 0)));
            $respostas = is_array($in['respostas'] ?? null) ? array_slice($in['respostas'], 0, TOTAL_PLACAS) : [];
            // respostas: [{id, certo}] — so para o relatorio do que o pessoal mais erra
            $respostas = array_values(array_filter(array_map(fn($r) => is_array($r) && isset($r['id'])
                ? ['id' => substr(preg_replace('/[^a-z0-9-]/', '', (string)$r['id']), 0, 40), 'certo' => !empty($r['certo'])] : null, $respostas)));
            if ($resultado === 'vitoria' && count($respostas) !== TOTAL_PLACAS) falha('Partida incompleta.');
            if ($acertos !== count(array_filter($respostas, fn($r) => $r['certo']))) falha('Partida inconsistente.');
            if ($duracao < 20) falha('Partida rapida demais.');

            $pontos = $acertos * PONTOS_ACERTO + $epis * PONTOS_EPI + ($resultado === 'vitoria' ? $capacetes * PONTOS_CAPACETE : 0);
            db()->prepare("INSERT INTO sipat_partida (nome, nome_chave, obra, pontos, acertos, epis, capacetes, resultado, duracao_seg, respostas)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                ->execute([$nome, nome_chave($nome), $obra, $pontos, $acertos, $epis, $capacetes, $resultado, $duracao, json_encode($respostas)]);

            $k = nome_chave($nome) . '|' . $obra;
            $rk = ranking();
            $minha = null;
            foreach (ranking(null, true) as $r) if ($r['chave'] === $k) { $minha = ['posicao' => $r['posicao'], 'pontos' => $r['pontos']]; break; }
            ok(['pontos' => $pontos, 'melhor' => $minha, 'jogadores' => count($rk)]);
        }
    }
    falha('acao desconhecida', 400);
} catch (Throwable $e) {
    falha('Erro no servidor: ' . $e->getMessage(), 500);
}
