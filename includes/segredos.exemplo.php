<?php
// Copie este arquivo para includes/segredos.php e preencha. segredos.php nao vai para o git.

// Banco MySQL/MariaDB (as tabelas sipat_* sao criadas sozinhas no primeiro acesso)
define('DB_HOST', 'localhost');
define('DB_PORT', 3306);
define('DB_NAME', 'sipat');
define('DB_USER', 'sipat');
define('DB_PASS', '');

// Senha do painel admin.php, guardada como hash. Gere com:
//   php -r "echo password_hash('SUA_SENHA_FORTE', PASSWORD_DEFAULT), PHP_EOL;"
define('ADMIN_SENHA_HASH', '');

// Opcional: lista de obras da tela de entrada no primeiro uso (depois o painel edita)
// define('OBRAS_INICIAIS', ['Residencial Exemplo', 'Obra Centro', 'Escritório / Sede', 'Outra']);
