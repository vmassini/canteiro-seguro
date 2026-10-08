#!/usr/bin/env bash
# Gera o site estatico de demonstracao em _site/ (e o que o GitHub Pages publica).
# A demo nao tem servidor: index.php e ranking.php viram .html com SIPAT_DEMO ligado, e o jogo passa a
# guardar partidas e ranking no navegador (assets/demo.js). api.php, admin.php e includes/ ficam de fora.
# Uso: bash ferramentas/gerar-demo.sh   (precisa do PHP na linha de comando; PHP=/caminho/php para outro)
set -euo pipefail
cd "$(dirname "$0")/.."
PHP="${PHP:-php}"
rm -rf _site
mkdir -p _site
cp -r assets _site/assets
marca='<script>window.SIPAT_DEMO = true;</script>'
for pagina in index ranking; do
  "$PHP" "$pagina.php" \
    | sed -e "s#</head>#  $marca\n</head>#" -e "s#ranking\.php#ranking.html#g" \
    > "_site/$pagina.html"
done
touch _site/.nojekyll
echo "Demo gerada em _site/ ($(find _site -type f | wc -l) arquivos)"
