// Modo demonstracao (sem servidor): usado quando a pagina e publicada como site estatico, por exemplo
// no GitHub Pages. Faz o papel do api.php guardando as partidas no proprio navegador (localStorage):
// cada aparelho tem o seu ranking. As regras de pontos e de "melhor partida" sao as mesmas do servidor.
(function () {
  const CHAVE = 'sipat_demo_partidas';
  const OBRAS = ['Obra Centro', 'Residencial das Flores', 'Condomínio Parque', 'Escritório / Sede', 'Outra'];

  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch (e) { return []; } }
  function gravar(l) { try { localStorage.setItem(CHAVE, JSON.stringify(l)); } catch (e) {} }

  // "  JOÃO  da Silva " e "joao da silva" viram a mesma pessoa
  const nomeChave = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const nomeCurto = n => { const p = n.trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : p[0]; };

  function ranking(obra) {
    const lista = ler().filter(p => !obra || p.obra === obra)
      .sort((a, b) => b.pontos - a.pontos || a.duracao_seg - b.duracao_seg || a.id - b.id);
    const vistos = new Set(), saida = [];
    for (const p of lista) {
      const k = nomeChave(p.nome) + '|' + p.obra;
      if (vistos.has(k)) continue;
      vistos.add(k);
      saida.push({ posicao: saida.length + 1, nome: nomeCurto(p.nome), obra: p.obra, pontos: p.pontos, duracao_seg: p.duracao_seg, chave: k });
    }
    return saida;
  }

  window.SipatDemo = {
    obras: () => ({ ok: true, obras: OBRAS }),
    ranking: obra => {
      const rk = ranking(obra);
      return { ok: true, ranking: rk.slice(0, 50), jogadores: rk.length, partidas: ler().length, obras: OBRAS };
    },
    salvar: d => {
      const pontos = d.acertos * 100 + d.epis * 25 + (d.resultado === 'vitoria' ? d.capacetes * 50 : 0);
      const lista = ler();
      lista.push({ id: Date.now(), nome: d.nome, obra: d.obra, pontos, duracao_seg: d.duracao_seg });
      gravar(lista);
      const k = nomeChave(d.nome) + '|' + d.obra;
      const rk = ranking();
      const minha = rk.find(r => r.chave === k);
      return { ok: true, pontos, melhor: minha && { posicao: minha.posicao, pontos: minha.pontos }, jogadores: rk.length };
    },
  };
})();
