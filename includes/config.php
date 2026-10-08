<?php
// Canteiro Seguro — jogo de seguranca do trabalho para SIPAT. Sem login: a pessoa informa nome completo
// e obra, joga quantas vezes quiser e vale a melhor partida no ranking (publico). O jogo roda todo no
// navegador; o servidor so guarda as partidas, devolve o ranking e mantem o painel do organizador (admin.php).
// Banco, senha do painel e lista inicial de obras ficam em includes/segredos.php (fora do git):
// copie includes/segredos.exemplo.php e preencha.
require_once __DIR__ . '/segredos.php';

date_default_timezone_set('America/Sao_Paulo');

if (!defined('DB_HOST')) define('DB_HOST', 'localhost');
if (!defined('DB_PORT')) define('DB_PORT', 3306);
if (!defined('DB_NAME')) define('DB_NAME', 'sipat');
if (!defined('DB_USER')) define('DB_USER', 'sipat');

// Pontuacao (o jogo usa as mesmas regras; o servidor recalcula a partir delas)
const PONTOS_ACERTO = 100;
const PONTOS_EPI = 25;
const PONTOS_CAPACETE = 50;
const TOTAL_PLACAS = 8;
const TOTAL_EPIS = 4;
const CAPACETES = 3;

// Obras da tela de entrada no primeiro uso (a tabela vazia e semeada com esta lista; depois o painel
// edita). Para usar a sua lista desde o inicio, defina OBRAS_INICIAIS no segredos.php.
if (!defined('OBRAS_INICIAIS')) define('OBRAS_INICIAIS', ['Obra 1', 'Obra 2', 'Obra 3', 'Escritório / Sede', 'Outra']);

function db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
        $pdo->exec("SET time_zone = '-03:00'");
    }
    return $pdo;
}

// Cria as tabelas se faltarem e semeia as obras. Idempotente; nao apaga nada.
function garantir_tabelas(): void {
    db()->exec("CREATE TABLE IF NOT EXISTS sipat_partida (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        nome_chave VARCHAR(100) NOT NULL,
        obra VARCHAR(100) NOT NULL,
        pontos INT NOT NULL,
        acertos TINYINT NOT NULL,
        epis TINYINT NOT NULL,
        capacetes TINYINT NOT NULL,
        resultado VARCHAR(10) NOT NULL,
        duracao_seg INT NOT NULL,
        respostas TEXT NOT NULL,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY ix_rank (pontos, duracao_seg),
        KEY ix_pessoa (nome_chave, obra)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    db()->exec("CREATE TABLE IF NOT EXISTS sipat_obra (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        ordem INT NOT NULL DEFAULT 0,
        UNIQUE KEY uk_nome (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    if ((int)db()->query("SELECT COUNT(*) FROM sipat_obra")->fetchColumn() === 0) {
        $ins = db()->prepare("INSERT IGNORE INTO sipat_obra (nome, ordem) VALUES (?, ?)");
        foreach (OBRAS_INICIAIS as $i => $o) $ins->execute([$o, $i]);
    }
}

function obras(): array {
    return db()->query("SELECT nome FROM sipat_obra ORDER BY ordem, nome")->fetchAll(PDO::FETCH_COLUMN);
}

// O servidor nao tem mbstring: estas funcoes tratam acento sem ela.
const ACENTOS = ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','í'=>'i','ì'=>'i','î'=>'i','ï'=>'i',
    'ó'=>'o','ò'=>'o','ô'=>'o','õ'=>'o','ö'=>'o','ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n',
    'Á'=>'a','À'=>'a','Â'=>'a','Ã'=>'a','Ä'=>'a','É'=>'e','È'=>'e','Ê'=>'e','Ë'=>'e','Í'=>'i','Ì'=>'i','Î'=>'i','Ï'=>'i',
    'Ó'=>'o','Ò'=>'o','Ô'=>'o','Õ'=>'o','Ö'=>'o','Ú'=>'u','Ù'=>'u','Û'=>'u','Ü'=>'u','Ç'=>'c','Ñ'=>'n'];

function texto_tamanho(string $s): int { return strlen(preg_replace('/[\x80-\xBF]/', '', $s)); }

// "  JOÃO  da Silva " e "joao da silva" viram a mesma pessoa no ranking
function nome_chave(string $nome): string {
    $s = strtolower(strtr(trim($nome), ACENTOS));
    return preg_replace('/\s+/', ' ', preg_replace('/[^a-z ]/', '', $s));
}

// No ranking publico aparece so primeiro e ultimo nome
function nome_curto(string $nome): string {
    $p = preg_split('/\s+/', trim($nome));
    return count($p) > 1 ? $p[0] . ' ' . $p[count($p) - 1] : $p[0];
}

// Melhor partida de cada pessoa (nome + obra). Desempate: menos tempo, depois quem fez primeiro.
function ranking(?string $obra = null, bool $completo = false): array {
    $sql = "SELECT id, nome, nome_chave, obra, pontos, duracao_seg, criado_em FROM sipat_partida"
         . ($obra ? " WHERE obra = ?" : "") . " ORDER BY pontos DESC, duracao_seg ASC, id ASC";
    $st = db()->prepare($sql);
    $st->execute($obra ? [$obra] : []);
    $vistos = []; $lista = [];
    foreach ($st as $r) {
        $k = $r['nome_chave'] . '|' . $r['obra'];
        if (isset($vistos[$k])) continue;
        $vistos[$k] = true;
        $item = ['posicao' => count($lista) + 1, 'nome' => $completo ? $r['nome'] : nome_curto($r['nome']),
                 'obra' => $r['obra'], 'pontos' => (int)$r['pontos'], 'duracao_seg' => (int)$r['duracao_seg']];
        if ($completo) $item += ['id' => (int)$r['id'], 'quando' => $r['criado_em'], 'chave' => $k];
        $lista[] = $item;
    }
    return $lista;
}

function app_capturar_fatal(): void {
    register_shutdown_function(function () {
        $e = error_get_last();
        if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            if (!headers_sent()) { http_response_code(500); header('Content-Type: application/json; charset=utf-8'); }
            echo json_encode(['error' => 'erro interno: ' . $e['message'] . ' (' . basename($e['file']) . ':' . $e['line'] . ')']);
        }
    });
}
