// Canteiro Seguro — jogo da SIPAT, feito para celular e para quem nunca jogou nada.
// Roda todo no navegador: toque no chao para andar, pegue os EPIs (cada um libera uma area),
// responda as placas de seguranca e saude e chegue ao ponto de encontro. No fim a partida vai para
// api.php, que recalcula os pontos e devolve a posicao no ranking.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const chave = (x, y) => x + ',' + y;
// Modo demonstracao (site estatico, sem api.php): partidas e ranking ficam no navegador (assets/demo.js)
const DEMO = !!window.SIPAT_DEMO;
const URL_RANKING = DEMO ? 'ranking.html' : 'ranking.php';
const $ = s => document.querySelector(s);
const palco = $('#palco');
const canvas = $('#tela');

const COR = {
  ceu: 0xbfe0f2, base: 0x6b5a43, terra1: 0xe8cf9f, terra2: 0xddc290,
  via: 0x4a4f59, faixa: 0xffffff, escuro: 0x2b3140, metal: 0x8a94a6, madeira: 0xb98a5a,
  bloco: 0xb9b2a4, areia: 0xd9b56b, laranja: 0xff7a1a, amarelo: 0xeec100, colete: 0xff7a1a,
  calca: 0x2c3e66, pele: 0xf1c27d, perigo: 0xff2d55, ok: 0x2ecc71, roxo: 0xa05cff,
};
const ZONAS = {
  h: { cor: 0xaebfd3, epi: 'cinto', rotulo: 'ALTURA', alto: .18 },
  r: { cor: 0xcbbbe0, epi: 'abafador', rotulo: 'RUÍDO' },
  s: { cor: 0xf0c8a0, epi: 'oculos', rotulo: 'SOLDA' },
  q: { cor: 0xc2dfb2, epi: 'luvas', rotulo: 'QUÍMICOS' },
  g: { cor: 0xe8b4b4, rotulo: 'ÁREA ISOLADA' },
};
// cor de cada EPI no 3D (nome, texto e emoji vem do conteudo.json)
const EPI = { cinto: { cor: 0xff7a1a }, oculos: { cor: 0x3fa9f5 }, abafador: { cor: 0xe53935 }, luvas: { cor: 0xf2c200 } };

// ---------- utilidades de animacao ----------
const tweens = new Set();
// a animacao anda no requestAnimationFrame, mas o timeout garante o fim mesmo com a aba
// em segundo plano (rAF pausado) — senao o jogo ficaria travado esperando um quadro
const tween = (dur, fn) => new Promise(res => {
  const t = { t0: performance.now(), dur, fn, res };
  tweens.add(t);
  setTimeout(() => { if (tweens.delete(t)) { fn(1); res(); } }, dur + 60);
});
const suave = p => (p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const esperar = ms => new Promise(r => setTimeout(r, ms));

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0);
}

// ---------- cena ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  document.body.insertAdjacentHTML('beforeend', '<p style="padding:24px;text-align:center">Este celular não conseguiu abrir o jogo em 3D. Tente atualizar o navegador ou use outro aparelho.</p>');
  throw new Error('WebGL indisponivel');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// correcao de tom: cores mais naturais e sol sem "estourar" o branco
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const cena = new THREE.Scene();
const HORIZONTE = 0xdcecf5;
cena.background = (() => {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#6fb3e3'); grad.addColorStop(.7, '#bfe0f2'); grad.addColorStop(1, '#dcecf5');
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
// neblina leve: o gramado e as arvores longe somem no horizonte em vez de terminar num corte seco
cena.fog = new THREE.Fog(HORIZONTE, 26, 58);
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);

cena.add(new THREE.HemisphereLight(0xe8f4ff, 0x8d7b5c, 1.05));
const sol = new THREE.DirectionalLight(0xffefd2, 2.4);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 70 });
sol.shadow.bias = -0.0005;
sol.shadow.normalBias = .02;
cena.add(sol, sol.target);
// luz de preenchimento azulada do lado oposto: a sombra fica com volume em vez de chapada
const preenchimento = new THREE.DirectionalLight(0xbcd6ff, .45);
preenchimento.position.set(10, 8, -10);
cena.add(preenchimento);

// ---------- texturas feitas no proprio navegador (nada para baixar) ----------
function semente(n) { let s = n; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function texCanvas(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}
// grao + manchas claras/escuras; quase branca para so "sujar" a cor do material
function texRuido(seed, min = 205, manchas = 18) {
  const tam = 128, c = document.createElement('canvas');
  c.width = c.height = tam;
  const g = c.getContext('2d'), rnd = semente(seed);
  const img = g.createImageData(tam, tam);
  for (let i = 0; i < tam * tam; i++) {
    const v = min + rnd() * (255 - min);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < manchas; i++) {
    g.fillStyle = rnd() < .5 ? `rgba(0,0,0,${.02 + rnd() * .04})` : `rgba(255,255,255,${.03 + rnd() * .05})`;
    g.beginPath(); g.arc(rnd() * tam, rnd() * tam, 4 + rnd() * 16, 0, Math.PI * 2); g.fill();
  }
  return c;
}
function texListras() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, 128, 16);
  g.fillStyle = '#f2c200';
  for (let x = -16; x < 144; x += 32) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x + 16, 0); g.lineTo(x + 32, 0); g.lineTo(x + 16, 16); g.fill(); }
  return texCanvas(c);
}
// trelica da grua: so as barras sao opacas, o resto e transparente (alphaTest)
function texTrelica() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#f2c200'; g.lineWidth = 7;
  g.strokeRect(3, 3, 58, 58);
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(3, 3); g.lineTo(61, 61); g.moveTo(61, 3); g.lineTo(3, 61); g.stroke();
  return c;
}
const TEX = {
  chao: texCanvas(texRuido(7, 226, 9)),
  asfalto: texCanvas(texRuido(11, 150, 26)),
  grama: texCanvas(texRuido(23, 170, 40), 30, 30),
  listras: texListras(),
  trelica: texTrelica(),
};

// ---------- pecas do canteiro ----------
function material(cor, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: cor, roughness: .8, metalness: .05, ...extra });
}

function caixa(w, h, d, cor, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(cor, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cilindro(rt, rb, h, cor, seg = 14, extra) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material(cor, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// placa de texto que sempre olha para a camera; `largura` e a de um texto curto, e textos longos
// alargam o canvas em vez de serem cortados
function rotulo(texto, cor = '#eec100', largura = 1.6) {
  const c = document.createElement('canvas');
  const fonte = '800 58px "Baloo 2", sans-serif';
  let g = c.getContext('2d');
  g.font = fonte;
  const w = g.measureText(texto).width + 60;
  c.width = Math.max(512, Math.ceil(w) + 12); c.height = 128;
  g = c.getContext('2d');
  g.font = fonte;
  g.fillStyle = 'rgba(15,20,30,.85)';
  g.beginPath(); g.roundRect((c.width - w) / 2, 14, w, 100, 40); g.fill();
  g.fillStyle = cor; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(texto, c.width / 2, 66);
  largura *= c.width / 512;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(largura, largura * c.height / c.width, 1);
  s.renderOrder = 10;
  return s;
}

function placaAviso() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c200'; g.strokeStyle = '#1b1b1b'; g.lineWidth = 10; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(64, 10); g.lineTo(120, 112); g.lineTo(8, 112); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#1b1b1b'; g.font = '900 70px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('!', 64, 100);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  return m;
}

// ---------- pecas do canteiro ----------
function paleteBlocos() {
  const g = new THREE.Group();
  const p = caixa(.85, .1, .85, COR.madeira); p.position.y = .05; g.add(p);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    const b = caixa(.38, .2, .26, COR.bloco); b.position.set(-.2 + j * .4, .2 + i * .21, -.15 + k * .3); g.add(b);
  }
  return g;
}

function montanhaAreia() {
  const m = new THREE.Mesh(new THREE.ConeGeometry(.45, .5, 10), material(COR.areia, { flatShading: true }));
  m.position.y = .25; m.castShadow = true;
  const g = new THREE.Group(); g.add(m); return g;
}

function container() {
  const g = new THREE.Group();
  const c = caixa(.92, .85, .7, 0x2f7d8c, { metalness: .3, roughness: .6 }); c.position.y = .425; g.add(c);
  for (let i = -3; i <= 3; i++) { const r = caixa(.02, .8, .72, 0x266a77); r.position.set(i * .12, .425, 0); g.add(r); }
  return g;
}

function tambores() {
  const g = new THREE.Group();
  for (const [x, z, cor] of [[-.2, -.15, 0x1f5fbf], [.2, -.1, 0xd23c3c], [0, .22, 0x1f5fbf]]) {
    const t = cilindro(.17, .17, .48, cor); t.position.set(x, .24, z); g.add(t);
  }
  return g;
}

function cone() {
  const g = new THREE.Group();
  const base = caixa(.42, .04, .42, COR.escuro); base.position.y = .02; g.add(base);
  const c = new THREE.Mesh(new THREE.ConeGeometry(.17, .5, 16), material(COR.laranja)); c.position.y = .29; c.castShadow = true; g.add(c);
  const f = cilindro(.1, .125, .08, 0xffffff, 16); f.position.y = .33; g.add(f);
  return g;
}

function obstaculo(x, y) {
  const h = hash(x, y) % 10;
  const m = h < 4 ? paleteBlocos() : h < 6 ? montanhaAreia() : h < 8 ? tambores() : h < 9 ? container() : cone();
  m.rotation.y = (hash(y, x) % 4) * Math.PI / 2;
  m.position.set(x, 0, y);
  return m;
}

// objeto que mostra que tipo de risco esta naquela casa (o texto so vem no cartao)
function propRisco(icone) {
  const g = new THREE.Group();
  switch (icone) {
    case 'buraco': case 'vala': {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(.6, icone === 'vala' ? .8 : .5), new THREE.MeshBasicMaterial({ color: 0x14100c }));
      b.rotation.x = -Math.PI / 2; b.position.y = .011; g.add(b);
      if (icone === 'buraco') { const p = caixa(.5, .01, .4, 0xb08b5a); p.position.set(.1, .02, .05); p.rotation.y = .3; g.add(p); }
      else { const t = new THREE.Mesh(new THREE.ConeGeometry(.2, .25, 8), material(0x8a6a40, { flatShading: true })); t.position.set(.32, .12, 0); g.add(t); }
      break;
    }
    case 'fio': case 'benjamim': {
      const fio = new THREE.Mesh(new THREE.TorusGeometry(.22, .025, 6, 24, Math.PI * 1.5), material(0x1b1b1b));
      fio.rotation.x = -Math.PI / 2; fio.position.y = .03; g.add(fio);
      const poca = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), new THREE.MeshStandardMaterial({ color: 0x5f8fbf, roughness: .1, transparent: true, opacity: .7 }));
      poca.rotation.x = -Math.PI / 2; poca.position.y = .012; g.add(poca);
      break;
    }
    case 'andaime': case 'escada': case 'cinto': {
      for (const [x, z] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) { const t = cilindro(.025, .025, 1, COR.metal); t.position.set(x, .5, z); g.add(t); }
      const piso = caixa(.7, .04, .7, COR.madeira); piso.position.y = .7; piso.rotation.z = .08; g.add(piso);
      break;
    }
    case 'extintor': {
      const e = cilindro(.09, .09, .4, 0xd32f2f); e.position.set(0, .2, 0); g.add(e);
      for (let i = 0; i < 2; i++) { const s = caixa(.3, .2, .25, 0xb0aaa0); s.position.set(-.25 + i * .5, .1, .2); g.add(s); }
      break;
    }
    case 'material': {
      const p = paleteBlocos(); p.rotation.z = .12; p.scale.set(.8, 1.3, .8); g.add(p);
      break;
    }
    case 'betoneira': case 'serra': {
      const d = cilindro(.22, .16, .4, 0xd9822b); d.rotation.z = Math.PI / 2.6; d.position.y = .45; g.add(d);
      const p = caixa(.1, .35, .1, COR.escuro); p.position.y = .18; g.add(p);
      break;
    }
    case 'quimico': {
      const t = cilindro(.15, .15, .4, 0xeeeeee); t.position.y = .2; g.add(t);
      break;
    }
    case 'solda': {
      const t = cilindro(.1, .1, .5, 0x2e7d32); t.position.set(-.15, .25, 0); g.add(t);
      const l = cilindro(.08, .08, .25, 0xc62828); l.position.set(.2, .125, .1); g.add(l);
      break;
    }
    case 'saude': {
      const cx = caixa(.42, .42, .3, 0xffffff); cx.position.y = .21; g.add(cx);
      const v = caixa(.08, .26, .02, 0x1f9d8a); v.position.set(0, .21, .16); g.add(v);
      const h = caixa(.26, .08, .02, 0x1f9d8a); h.position.set(0, .21, .16); g.add(h);
      break;
    }
    default: {
      const c = cone(); c.position.x = .25; g.add(c);
    }
  }
  const aviso = placaAviso();
  aviso.position.y = 1.15;
  g.add(aviso);
  const m = marcador(COR.amarelo);
  g.add(m);
  g.userData.aviso = aviso;
  g.userData.marcador = m;
  return g;
}

function itemEpi(tipo) {
  const g = new THREE.Group();
  const giro = new THREE.Group(); giro.position.y = .55; g.add(giro);
  const cor = EPI[tipo].cor;
  if (tipo === 'cinto') {
    const t = new THREE.Mesh(new THREE.TorusGeometry(.2, .045, 8, 24), material(cor)); giro.add(t);
    const f = caixa(.06, .4, .04, cor); f.position.y = -.05; giro.add(f);
  } else if (tipo === 'oculos') {
    for (const x of [-.11, .11]) { const l = new THREE.Mesh(new THREE.TorusGeometry(.08, .025, 8, 18), material(cor)); l.position.x = x; giro.add(l); }
    const v = caixa(.36, .1, .02, 0x9fd4ff, { transparent: true, opacity: .6 }); giro.add(v);
  } else if (tipo === 'abafador') {
    const arco = new THREE.Mesh(new THREE.TorusGeometry(.18, .03, 8, 20, Math.PI), material(0x333333)); giro.add(arco);
    for (const x of [-.18, .18]) { const c = cilindro(.08, .08, .08, cor); c.rotation.z = Math.PI / 2; c.position.set(x, -.02, 0); giro.add(c); }
  } else {
    for (const x of [-.1, .1]) { const m = caixa(.14, .22, .06, cor); m.position.x = x; giro.add(m); }
  }
  const m = marcador(cor, 1.3);
  g.add(m);
  g.userData.giro = giro;
  g.userData.marcador = m;
  return g;
}

function betoneira() {
  const g = new THREE.Group();
  const corpo = new THREE.Group(); g.add(corpo);
  const chassi = caixa(.9, .12, .5, COR.escuro); chassi.position.y = .2; corpo.add(chassi);
  const cab = caixa(.28, .35, .48, 0xf5f5f5); cab.position.set(.3, .42, 0); corpo.add(cab);
  const vidro = caixa(.02, .16, .4, 0x7fb6e8); vidro.position.set(.445, .48, 0); corpo.add(vidro);
  const tambor = cilindro(.2, .26, .55, 0xd9822b, 16); tambor.rotation.z = Math.PI / 2 - .25; tambor.position.set(-.15, .5, 0); corpo.add(tambor);
  for (const [x, z] of [[.3, .26], [.3, -.26], [-.25, .26], [-.25, -.26]]) {
    const r = cilindro(.1, .1, .07, 0x1b1b1b, 12); r.rotation.x = Math.PI / 2; r.position.set(x, .1, z); corpo.add(r);
  }
  const giroflex = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffa000, emissive: 0xffa000, emissiveIntensity: 1 }));
  giroflex.position.set(.3, .63, 0); corpo.add(giroflex);
  g.userData = { tambor, giroflex, corpo };
  return g;
}

// peca treliçada (mastro e lanca da grua): caixa com a textura de barras, repetida no comprimento
function trelica(w, h, d, repX, repY) {
  const t = texCanvas(TEX.trelica, repX, repY);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ map: t, alphaTest: .5, side: THREE.DoubleSide, roughness: .6, metalness: .2 }));
  return m;
}

// Grua de torre: mastro numa casa de obstaculo, lanca apontando para a area isolada e a carga
// balancando por cima dela (so enfeite; quem passa embaixo ja e barrado pelas regras).
function gruaTorre(alturaMastro, dx, dz) {
  const H = alturaMastro;
  const g = new THREE.Group();
  const base = caixa(.7, .25, .7, 0x9e9e9e); base.position.y = .12; g.add(base);
  const mastro = trelica(.38, H, .38, 1, H / .38); mastro.position.y = H / 2; g.add(mastro);
  const topo = new THREE.Group(); topo.position.y = H; g.add(topo);
  topo.rotation.y = -Math.atan2(dz, dx);
  const dist = Math.hypot(dx, dz);
  const L = Math.max(dist + 1.2, 3);
  const cab = caixa(.5, .42, .45, 0xf4f4f4); cab.position.set(.05, .2, .38); topo.add(cab);
  const vidro = caixa(.02, .22, .36, 0x7fb6e8, { metalness: .4, roughness: .2 }); vidro.position.set(.31, .25, .38); topo.add(vidro);
  const lanca = trelica(L, .3, .3, L / .3, 1); lanca.position.set(L / 2, .55, 0); topo.add(lanca);
  const contra = trelica(1.8, .26, .3, 1.8 / .26, 1); contra.position.set(-.9, .55, 0); topo.add(contra);
  const peso = caixa(.5, .45, .5, 0x8d8d8d); peso.position.set(-1.6, .35, 0); topo.add(peso);
  const torre = new THREE.Mesh(new THREE.ConeGeometry(.3, 1, 4), material(COR.amarelo)); torre.position.y = 1.2; torre.rotation.y = Math.PI / 4; topo.add(torre);
  const luz = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff3030, emissiveIntensity: 1.5 }));
  luz.position.y = 1.75; topo.add(luz);
  const carro = caixa(.32, .12, .34, 0x555555); carro.position.set(dist, .36, 0); topo.add(carro);
  const cabo = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1, 5), material(0x222222));
  cabo.position.x = dist; topo.add(cabo);
  const carga = new THREE.Group(); topo.add(carga);
  const gancho = caixa(.12, .14, .12, COR.amarelo); gancho.position.y = .5; carga.add(gancho);
  const p = paleteBlocos(); p.scale.setScalar(.8); carga.add(p);
  for (const [x, z] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .62, 4), material(0x333333));
    c.position.set(x / 2, .28, z / 2); c.rotation.set(z * .9, 0, -x * .9); carga.add(c);
  }
  g.userData = { carga, cabo, dist, H, luz };
  return g;
}

// predio em construcao atras do tapume: estrutura de concreto, alvenaria subindo e andaime com tela
function predioEmObra() {
  const g = new THREE.Group();
  const concreto = 0xbdbab3, andares = 4, alt = 1.15, lx = 6.4, lz = 3.2;
  const texConcreto = texCanvas(texRuido(31, 190, 30));
  for (let a = 0; a < andares; a++) {
    const y0 = a * alt;
    const laje = new THREE.Mesh(new THREE.BoxGeometry(lx + .3, .16, lz + .3), material(concreto, { map: texConcreto }));
    laje.position.y = y0 + alt; laje.castShadow = laje.receiveShadow = true; g.add(laje);
    for (const x of [-3, -1, 1, 3]) for (const z of [-1.5, 1.5]) {
      const col = caixa(.26, alt, .26, concreto); col.position.set(x, y0 + alt / 2, z); g.add(col);
    }
    if (a < 2) {   // alvenaria nos andares de baixo
      for (const x of [-2, 0, 2]) {
        const parede = caixa(1.7, alt * (a === 1 ? .55 : 1), .18, 0xc9673f, { map: texConcreto });
        parede.position.set(x, y0 + alt * (a === 1 ? .275 : .5), 1.5); g.add(parede);
      }
    }
  }
  for (let i = 0; i < 8; i++) {   // ferragem de espera no topo
    const f = cilindro(.02, .02, .5, 0x5a4636, 5); f.position.set(-3 + (i % 4) * 2, andares * alt + .33, i < 4 ? -1.5 : 1.5); g.add(f);
  }
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(3.4, alt * 3), new THREE.MeshStandardMaterial({ color: 0x2e8b3a, transparent: true, opacity: .62, side: THREE.DoubleSide }));
  tela.position.set(-1.6, alt * 1.5 + .1, lz / 2 + .55); g.add(tela);
  for (let i = 0; i <= 3; i++) {
    const t = cilindro(.03, .03, alt * 3.2, COR.metal, 6); t.position.set(-3.3 + i * 1.13, alt * 1.6, lz / 2 + .5); g.add(t);
  }
  return g;
}

function arvore(seed) {
  const rnd = semente(seed + 1);
  const g = new THREE.Group();
  const tronco = cilindro(.07, .1, .55, 0x7a5236, 6); tronco.position.y = .27; g.add(tronco);
  const verdes = [0x4f9a45, 0x5fae4e, 0x3f8a3f];
  for (let i = 0; i < 3; i++) {
    const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(.42 - i * .08, 0), material(verdes[i % 3], { flatShading: true }));
    copa.position.set((rnd() - .5) * .2, .75 + i * .28, (rnd() - .5) * .2); copa.castShadow = true; g.add(copa);
  }
  g.scale.setScalar(.85 + rnd() * .6);
  g.rotation.y = rnd() * 6;
  return g;
}

function carrinhoDeMao() {
  const g = new THREE.Group();
  const cacamba = new THREE.Mesh(new THREE.CylinderGeometry(.24, .16, .18, 4, 1), material(0x3f7fbf, { metalness: .3 }));
  cacamba.rotation.y = Math.PI / 4; cacamba.scale.set(1.2, 1, .8); cacamba.position.y = .3; g.add(cacamba);
  const areia = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), material(COR.areia)); areia.position.y = .36; areia.scale.set(1.1, .5, .8); g.add(areia);
  const roda = cilindro(.09, .09, .05, 0x1b1b1b, 12); roda.rotation.z = Math.PI / 2; roda.position.set(0, .09, .3); g.add(roda);
  for (const x of [-.12, .12]) { const c = cilindro(.015, .015, .55, COR.metal, 5); c.rotation.x = Math.PI / 2.4; c.position.set(x, .3, -.2); g.add(c); }
  return g;
}

// colega trabalhando numa casa de obstaculo: so enfeite, para o canteiro ter vida
function colegaTrabalhando(tipo, seed) {
  const g = new THREE.Group();
  // colegas nunca de colete laranja + capacete amarelo: essa combinacao e so do jogador
  const cores = [[0x1f6fbf, 0xffffff], [0x2e9e57, 0xffffff], [0x7f8c8d, 0x1f6fbf]][seed % 3];
  const p = jogador3d({ colete: cores[0], capacete: cores[1] });
  p.userData.tipo = tipo;
  p.userData.fase = seed;
  if (tipo === 'pa') {
    const monte = montanhaAreia(); monte.scale.setScalar(.75); monte.position.set(-.18, 0, -.2); g.add(monte);
    const pa = new THREE.Group();
    const cabo = cilindro(.015, .015, .5, 0x8a6a40, 5); cabo.position.y = -.2; pa.add(cabo);
    const lamina = caixa(.12, .02, .14, 0x666666); lamina.position.set(0, -.46, .04); pa.add(lamina);
    p.userData.bracos[1].add(pa);
    p.position.set(.18, 0, .12); p.rotation.y = -2.4;
  } else if (tipo === 'carrinho') {
    const c = carrinhoDeMao(); c.position.set(0, 0, .12); c.rotation.y = .5; g.add(c);
    p.position.set(-.12, 0, -.28); p.rotation.y = .5;
  } else {
    const banca = caixa(.6, .35, .4, COR.madeira); banca.position.set(0, .175, -.15); g.add(banca);
    const bloco = caixa(.25, .12, .15, COR.bloco); bloco.position.set(0, .41, -.15); g.add(bloco);
    const martelo = new THREE.Group();
    const cabo = cilindro(.015, .015, .25, 0x8a6a40, 5); cabo.position.y = -.33; martelo.add(cabo);
    const cabeca = caixa(.1, .05, .05, 0x555555); cabeca.position.y = -.45; martelo.add(cabeca);
    p.userData.bracos[1].add(martelo);
    p.position.set(0, 0, .22); p.rotation.y = Math.PI;
  }
  g.add(p);
  g.userData.colega = p;
  return g;
}

// coluna de luz + anel pulsando: marca o que e objetivo (placa, EPI, ponto de encontro)
function marcador(cor, altura = 1.7) {
  const g = new THREE.Group();
  const feixe = new THREE.Mesh(new THREE.CylinderGeometry(.24, .34, altura, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  feixe.position.y = altura / 2; g.add(feixe);
  const anel = new THREE.Mesh(new THREE.RingGeometry(.3, .4, 32),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false }));
  anel.rotation.x = -Math.PI / 2; anel.position.y = .02; g.add(anel);
  g.userData = { anel, feixe };
  return g;
}

function pontoEncontro() {
  const g = new THREE.Group();
  const poste = cilindro(.04, .04, 1.2, COR.metal); poste.position.set(.3, .6, -.3); g.add(poste);
  const placa = caixa(.5, .32, .03, COR.ok); placa.position.set(.3, 1.15, -.3); g.add(placa);
  const tapete = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ color: COR.perigo, transparent: true, opacity: .25 }));
  tapete.rotation.x = -Math.PI / 2; tapete.position.y = .014; g.add(tapete);
  // rotulo um pouco para dentro: o ponto de encontro fica no canto do mapa e o texto sairia da tela
  const r = rotulo('PONTO DE ENCONTRO', '#7ee2a8', 1.8); r.position.set(-.7, 1.65, 0); g.add(r);
  g.userData = { tapete, placa };
  return g;
}

// Boneco de obra. Pernas e bracos ficam em "articulacoes" (grupos no quadril/ombro) para balancar
// ao andar. Os colegas do cenario usam o mesmo boneco com outras cores.
function jogador3d(op = {}) {
  const corColete = op.colete ?? COR.colete, corCasco = op.capacete ?? COR.amarelo;
  const g = new THREE.Group();
  const corpo = new THREE.Group(); g.add(corpo);
  const pernas = [], bracos = [], maos = [];
  for (const x of [-.08, .08]) {
    const quadril = new THREE.Group(); quadril.position.set(x, .27, 0);
    const perna = caixa(.12, .24, .14, COR.calca); perna.position.y = -.12; quadril.add(perna);
    const bota = caixa(.13, .07, .19, 0x3b2a1a); bota.position.set(0, -.235, .025); quadril.add(bota);
    corpo.add(quadril); pernas.push(quadril);
  }
  const tronco = new THREE.Mesh(new RoundedBoxGeometry(.36, .34, .24, 2, .05), material(corColete));
  tronco.position.y = .43; tronco.castShadow = true; corpo.add(tronco);
  for (const y of [.38, .5]) { const faixa = caixa(.37, .035, .25, 0xe6edf5, { metalness: .6, roughness: .3 }); faixa.position.y = y; corpo.add(faixa); }
  for (const x of [-.235, .235]) {
    const ombro = new THREE.Group(); ombro.position.set(x, .56, 0);
    const braco = caixa(.09, .26, .11, corColete); braco.position.y = -.12; ombro.add(braco);
    const mao = caixa(.08, .07, .09, COR.pele); mao.position.y = -.29; ombro.add(mao);
    corpo.add(ombro); bracos.push(ombro); maos.push(mao);
  }
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(.15, 20, 14), material(COR.pele)); cabeca.position.y = .74; cabeca.castShadow = true; corpo.add(cabeca);
  for (const x of [-.055, .055]) {
    const olho = new THREE.Mesh(new THREE.SphereGeometry(.022, 8, 6), material(0x1b1b1b)); olho.position.set(x, .75, .135); corpo.add(olho);
  }
  const casco = new THREE.Mesh(new THREE.SphereGeometry(.175, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), material(corCasco, { roughness: .35 }));
  casco.position.y = .78; casco.castShadow = true; corpo.add(casco);
  const aba = cilindro(.21, .21, .025, corCasco, 20); aba.position.set(0, .78, .03); corpo.add(aba);

  // EPIs que aparecem no boneco conforme ele pega
  const vestir = {
    oculos: (() => { const v = caixa(.24, .06, .03, 0x3fa9f5, { transparent: true, opacity: .85 }); v.position.set(0, .755, .15); return v; })(),
    abafador: (() => { const a = new THREE.Group(); for (const x of [-.16, .16]) { const c = cilindro(.06, .06, .06, EPI.abafador.cor); c.rotation.z = Math.PI / 2; c.position.set(x, .73, 0); a.add(c); } return a; })(),
    cinto: (() => { const c = new THREE.Group(); for (const x of [-.09, .09]) { const f = caixa(.04, .36, .26, EPI.cinto.cor); f.position.set(x, .45, 0); c.add(f); } return c; })(),
  };
  for (const v of Object.values(vestir)) { v.visible = false; corpo.add(v); }
  g.userData = { corpo, vestir, maos, pernas, bracos };
  return g;
}

function clusters(grade, letra) {
  const visto = new Set(), grupos = [];
  for (let y = 0; y < grade.length; y++) for (let x = 0; x < grade[0].length; x++) {
    if (grade[y][x] !== letra || visto.has(chave(x, y))) continue;
    const fila = [[x, y]], g = [];
    visto.add(chave(x, y));
    while (fila.length) {
      const [cx, cy] = fila.shift(); g.push([cx, cy]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (grade[ny]?.[nx] === letra && !visto.has(chave(nx, ny))) { visto.add(chave(nx, ny)); fila.push([nx, ny]); }
      }
    }
    grupos.push(g);
  }
  return grupos;
}

function vestirEpi() {
  const j = obj.jogador;
  if (!j) return;
  for (const [tipo, m] of Object.entries(j.userData.vestir)) m.visible = !!jogo.tenho[tipo];
  for (const mao of j.userData.maos) mao.material.color.setHex(jogo.tenho.luvas ? EPI.luvas.cor : COR.pele);
}

// ---------- estado da partida ----------
let C = null;          // conteudo.json
let jogo = null;       // partida em andamento
let jogador = { nome: '', obra: '' };
const obj = { pisos: {}, placas: {}, epis: {}, jogador: null, saida: null, caminhoes: [], grua: null, colegas: [], marcaSaida: null };

// Junta as malhas estaticas que usam o mesmo material numa so: de ~300 chamadas de desenho por
// quadro para algumas dezenas. Posicao/rotacao de cada peca vao "assadas" na geometria.
function mesclar(grupo) {
  grupo.updateMatrixWorld(true);
  const baldes = new Map();
  grupo.traverse(m => {
    if (!m.isMesh) return;
    const mt = m.material;
    const k = [mt.type, mt.color?.getHex(), mt.map?.uuid, mt.transparent, mt.opacity, mt.side, mt.alphaTest,
               mt.flatShading, mt.roughness, mt.metalness, mt.emissive?.getHex(), m.castShadow].join('|');
    if (!baldes.has(k)) baldes.set(k, { mat: mt, sombra: m.castShadow, geos: [] });
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    for (const nome of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(nome)) g.deleteAttribute(nome);
    baldes.get(k).geos.push(g);
  });
  const saida = new THREE.Group();
  for (const b of baldes.values()) {
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    const malha = new THREE.Mesh(geo, b.mat);
    malha.castShadow = b.sombra; malha.receiveShadow = true;
    saida.add(malha);
  }
  return saida;
}
let mundo = null;

function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function novaPartida() {
  const m = C.mapa;
  const sorteadas = embaralhar([
    ...embaralhar(C.seguranca).slice(0, m.placas_seguranca).map(p => ({ ...p, tema: 'seguranca' })),
    ...embaralhar(C.saude).slice(0, m.placas_saude).map(p => ({ ...p, tema: 'saude' })),
  ]);
  const placas = {};
  m.placas.forEach(([x, y], i) => {
    placas[chave(x, y)] = { item: sorteadas[i], ordem: embaralhar([0, 1, 2]), status: 'pendente' };
  });
  const epis = {};
  for (const e of m.epis) epis[chave(e.x, e.y)] = e.tipo;
  let inicio = null, saida = null;
  m.grade.forEach((l, y) => [...l].forEach((c, x) => { if (c === 'S') inicio = { x, y }; if (c === 'E') saida = { x, y }; }));
  jogo = {
    grade: m.grade, w: m.grade[0].length, h: m.grade.length,
    jogador: { ...inicio }, saida, placas, epis,
    tenho: { cinto: false, oculos: false, abafador: false, luvas: false },
    capacetes: 3, acertos: 0, episPegos: 0, respostas: [], t0: Date.now(), fim: null, viuIsolada: false,
  };
}

const pendentes = () => Object.values(jogo.placas).filter(p => p.status === 'pendente').length;
const pontosAtuais = () => jogo.acertos * 100 + jogo.episPegos * 25;

// ---------- mundo 3D ----------
function alturaPiso(c) { return ZONAS[c]?.alto || 0; }
const yDe = (x, y) => alturaPiso(jogo?.grade?.[y]?.[x]);

// Em volta do canteiro: gramado, tapume no fundo, barreiras nas laterais, o predio subindo e arvores.
function arredores(w, h, est) {
  const grama = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), material(0x8fbd62, { map: TEX.grama, roughness: 1 }));
  grama.rotation.x = -Math.PI / 2; grama.position.set((w - 1) / 2, -.76, (h - 1) / 2); grama.receiveShadow = true;
  est.add(grama);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(w + 7, 9), material(0xbfae8c, { map: TEX.chao }));
  chao.rotation.x = -Math.PI / 2; chao.position.set((w - 1) / 2, -.755, -4.6); chao.receiveShadow = true;
  est.add(chao);
  // tapume no fundo, com a faixa amarela
  for (let x = -.5; x < w; x++) {
    const placa = caixa(1, 1.15, .06, 0xf1f1ef); placa.position.set(x + .5, -.18 + .575, -.86); est.add(placa);
    const tira = caixa(1, .14, .065, COR.amarelo); tira.position.set(x + .5, .62, -.86); est.add(tira);
  }
  // barreiras zebradas baixas nas laterais (nao tapam a visao do mapa)
  for (let y = 0; y < h; y++) for (const x of [-.86, w - .14]) {
    const b = caixa(.08, .32, .96, y % 2 ? 0x1b1b1b : COR.amarelo); b.position.set(x, -.08, y); est.add(b);
  }
  const predio = predioEmObra(); predio.position.set((w - 1) / 2, -.75, -4.7); est.add(predio);
  const rnd = semente(97);
  for (let i = 0, n = 0; i < 200 && n < 26; i++) {
    const x = -9 + rnd() * (w + 18), z = -10 + rnd() * (h + 16);
    const dentro = x > -2.2 && x < w + 1.2 && z > -8.6 && z < h + 1.2;
    if (dentro) continue;
    const a = arvore(i); a.position.set(x, -.76, z); est.add(a); n++;
  }
}

function construir() {
  if (mundo) cena.remove(mundo);
  mundo = new THREE.Group();
  cena.add(mundo);
  Object.assign(obj, { pisos: {}, placas: {}, epis: {}, saida: null, caminhoes: [], grua: null, colegas: [], marcaSaida: null });
  // tudo que nao se mexe vai para 'est' e no fim vira poucas malhas (celular simples agradece)
  const est = new THREE.Group();
  const { w, h, grade } = jogo;

  const base = new THREE.Mesh(new RoundedBoxGeometry(w + .6, .5, h + .6, 3, .15), material(COR.base, { map: TEX.chao }));
  base.position.set((w - 1) / 2, -.5, (h - 1) / 2); base.receiveShadow = true; est.add(base);
  arredores(w, h, est);

  // casas de obstaculo que viram outra coisa: o mastro da grua (a mais perto da area isolada) e
  // tres colegas trabalhando
  const isolada = clusters(grade, 'g')[0];
  const centroIsolada = isolada && [isolada.reduce((s, p) => s + p[0], 0) / isolada.length, isolada.reduce((s, p) => s + p[1], 0) / isolada.length];
  const obstaculos = [];
  grade.forEach((l, y) => [...l].forEach((c, x) => { if (c === '#') obstaculos.push([x, y]); }));
  const mastro = centroIsolada && obstaculos.slice().sort((a, b) =>
    Math.hypot(a[0] - centroIsolada[0], a[1] - centroIsolada[1]) - Math.hypot(b[0] - centroIsolada[0], b[1] - centroIsolada[1]))[0];
  const colegas = {};
  obstaculos.filter(p => p !== mastro).sort((a, b) => hash(...a) - hash(...b)).slice(0, 3)
    .forEach((p, i) => { colegas[chave(...p)] = ['pa', 'martelo', 'carrinho'][i]; });
  obj.colegas = [];

  const geoPiso = new RoundedBoxGeometry(.97, .3, .97, 2, .04);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grade[y][x];
    let cor = (x + y) % 2 ? COR.terra2 : COR.terra1;
    if (c === 'v' || c === 'f') cor = COR.via;
    else if (ZONAS[c]) cor = new THREE.Color(ZONAS[c].cor).multiplyScalar((x + y) % 2 ? .95 : 1).getHex();
    const piso = new THREE.Mesh(geoPiso, material(cor, { roughness: .95, map: (c === 'v' || c === 'f') ? TEX.asfalto : TEX.chao }));
    const alto = alturaPiso(c);
    piso.position.set(x, -.15 + alto / 2, y);
    if (alto) piso.scale.y = 1 + alto / .3;
    piso.receiveShadow = true;
    piso.userData = { x, y };
    est.add(piso);
    if (c === 'f') {
      for (let i = -2; i <= 2; i++) { const f = caixa(.12, .012, .8, COR.faixa); f.position.set(x + i * .19, .006, y); f.castShadow = false; est.add(f); }
    } else if (c === 'v' && x % 2 === 0) {
      const f = caixa(.4, .01, .06, COR.amarelo); f.position.set(x, .006, y); f.castShadow = false; est.add(f);
    }
    if (c === '#' && mastro && x === mastro[0] && y === mastro[1]) {
      const gr = gruaTorre(5, centroIsolada[0] - x, centroIsolada[1] - y);
      gr.position.set(x, 0, y);
      mundo.add(gr);
      obj.grua = gr;
    } else if (c === '#' && colegas[chave(x, y)]) {
      const cg = colegaTrabalhando(colegas[chave(x, y)], x + y);
      cg.position.set(x, 0, y);
      mundo.add(cg);
      obj.colegas.push(cg.userData.colega);
    } else if (c === '#') est.add(obstaculo(x, y));
    // faixa zebrada pintada no chao em volta de cada area que exige EPI
    if (ZONAS[c]?.epi) {
      for (const [dx, dy, rot] of [[0, -1, 0], [0, 1, 0], [-1, 0, 1], [1, 0, 1]]) {
        if (grade[y + dy]?.[x + dx] === c) continue;
        const faixa = new THREE.Mesh(new THREE.PlaneGeometry(.97, .09), new THREE.MeshBasicMaterial({ map: TEX.listras }));
        faixa.rotation.x = -Math.PI / 2;
        if (rot) faixa.rotation.z = Math.PI / 2;
        faixa.position.set(x + dx * .44, alto + .012, y + dy * .44);
        est.add(faixa);
      }
    }
    if (c === 'g' && hash(x, y) % 2) {
      // fita zebrada em volta da area isolada
      const fita = caixa(.97, .05, .05, COR.perigo); fita.position.set(x, .5, y + .45); est.add(fita);
    }
    if (c === 'h' && (grade[y + 1]?.[x] ?? 'h') !== 'h') {
      const gc = caixa(.95, .04, .04, COR.amarelo); gc.position.set(x, alto + .45, y + .46); est.add(gc);
      for (const dx of [-.45, .45]) { const p = cilindro(.02, .02, .45, COR.amarelo, 6); p.position.set(x + dx, alto + .22, y + .46); est.add(p); }
    }
  }

  for (const [letra, z] of Object.entries(ZONAS)) {
    for (const g of clusters(grade, letra)) {
      const mx = g.reduce((s, p) => s + p[0], 0) / g.length, my = g.reduce((s, p) => s + p[1], 0) / g.length;
      const texto = z.epi ? `${z.rotulo} · ${C.epis[z.epi].emoji}` : z.rotulo;
      const r = rotulo(texto, letra === 'g' ? '#ffb4b4' : '#ffffff', 1.9);
      r.position.set(mx, 1.7, my);
      mundo.add(r);
    }
  }
  for (const [k, p] of Object.entries(jogo.placas)) {
    if (p.status !== 'pendente') continue;
    const [x, y] = k.split(',').map(Number);
    const m = propRisco(p.item.icone);
    m.position.set(x, yDe(x, y), y);
    m.userData.fase = (x * 7 + y * 3) % 6;
    mundo.add(m);
    obj.placas[k] = m;
  }
  for (const [k, tipo] of Object.entries(jogo.epis)) {
    const [x, y] = k.split(',').map(Number);
    const it = itemEpi(tipo);
    it.position.set(x, yDe(x, y), y);
    it.userData.fase = x + y;
    mundo.add(it);
    obj.epis[k] = it;
  }

  obj.saida = pontoEncontro();
  obj.saida.position.set(jogo.saida.x, 0, jogo.saida.y);
  mundo.add(obj.saida);
  obj.marcaSaida = null;

  // caminhoes de enfeite nas ruas: andam sozinhos e param antes da faixa se tiver gente nela
  grade.forEach((linha, y) => {
    if (!linha.includes('v')) return;
    const b = betoneira();
    b.position.set(hash(y, 3) % jogo.w, 0, y);
    b.userData.dir = y % 2 ? 1 : -1;
    b.userData.faixas = [...linha].map((c, x) => c === 'f' ? x : -1).filter(x => x >= 0);
    mundo.add(b);
    obj.caminhoes.push(b);
  });

  mundo.add(mesclar(est));
  // plano invisivel na altura do chao: o toque acerta ele e a casa sai de arredondar o ponto
  const alvoToque = new THREE.Mesh(new THREE.PlaneGeometry(w + 4, h + 4), new THREE.MeshBasicMaterial({ visible: false }));
  alvoToque.rotation.x = -Math.PI / 2; alvoToque.position.set((w - 1) / 2, .05, (h - 1) / 2);
  mundo.add(alvoToque);
  obj.alvoToque = alvoToque;

  obj.jogador = jogador3d();
  // circulo sob os pes: e assim que se acha o proprio boneco no meio dos colegas
  const voce = new THREE.Mesh(new THREE.RingGeometry(.26, .36, 32), new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: .9, depthWrite: false }));
  voce.rotation.x = -Math.PI / 2; voce.position.y = .025;
  obj.jogador.add(voce);
  obj.jogador.userData.voce = voce;
  obj.jogador.position.set(jogo.jogador.x, yDe(jogo.jogador.x, jogo.jogador.y), jogo.jogador.y);
  mundo.add(obj.jogador);
  vestirEpi();

  alvoCam.set(jogo.jogador.x, 0, jogo.jogador.y);
  ajustarCamera();
}

// ---------- camera: segue o boneco, enquadrada para celular em pe ----------
const OFFSET = new THREE.Vector3(2.5, 12, 9);
const alvoCam = new THREE.Vector3();
const camAtual = new THREE.Vector3();
function ajustarCamera() {
  const w = palco.clientWidth, h = palco.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const asp = w / h;
  // em pe mostra ~7 casas de largura; deitado (computador/TV) mostra mais.
  // ZOOM > 1 aproxima (1.30 = 30% maior, pedido do usuario em 08/10).
  const ZOOM = 1.30;
  const meiaL = (asp < 1 ? 4.3 : Math.min(9, 5.2 * asp)) / ZOOM;
  const meiaA = meiaL / asp;
  Object.assign(camera, { left: -meiaL, right: meiaL, top: meiaA, bottom: -meiaA });
  camera.updateProjectionMatrix();
}
new ResizeObserver(ajustarCamera).observe(palco);

function posicionarCamera(suavizar) {
  if (!jogo) return;
  // em cima o limite e maior (a camera inclinada mostra mais "para tras"); embaixo da para ir
  // quase ate a borda, que mostra gramado e nao ceu. Tela deitada mostra menos altura: limite menor.
  const emPe = palco.clientWidth < palco.clientHeight;
  const alvo = new THREE.Vector3(
    Math.min(Math.max(obj.jogador.position.x, 2), jogo.w - 2),
    0,
    Math.min(Math.max(obj.jogador.position.z, emPe ? 3.4 : 1.2), jogo.h - (emPe ? 1.6 : 1)) + (emPe ? .8 : .3),
  );
  if (suavizar) camAtual.lerp(alvo, .08); else camAtual.copy(alvo);
  camera.position.copy(camAtual).add(OFFSET);
  camera.lookAt(camAtual);
  sol.position.copy(camAtual).add(new THREE.Vector3(-6, 18, 8));
  sol.target.position.copy(camAtual);
}

// ---------- laco ----------
let movendo = false;
let tremor = 0;
let ultimo = performance.now();
function laco(agora) {
  requestAnimationFrame(laco);
  const dt = Math.min(.05, (agora - ultimo) / 1000);
  ultimo = agora;
  for (const t of tweens) {
    const p = Math.min(1, (agora - t.t0) / t.dur);
    t.fn(p);
    if (p >= 1) { tweens.delete(t); t.res(); }
  }
  const s = agora / 1000;
  for (const r of Object.values(obj.placas)) {
    if (r.userData.saindo) continue;
    r.userData.aviso.position.y = 1.15 + Math.sin(s * 2.4 + r.userData.fase) * .08;
    r.userData.aviso.rotation.y = s * 1.2 + r.userData.fase;
  }
  for (const e of Object.values(obj.epis)) {
    e.userData.giro.rotation.y = s * 1.5 + e.userData.fase;
    e.userData.giro.position.y = .55 + Math.sin(s * 2 + e.userData.fase) * .08;
  }
  // anel que cresce e some, sem parar: chama o olho para os objetivos
  const pulsar = (m, fase) => {
    if (!m) return;
    const t = (s * .8 + fase) % 1;
    m.userData.anel.scale.setScalar(1 + t * .9);
    m.userData.anel.material.opacity = .65 * (1 - t);
    m.userData.feixe.material.opacity = .11 + Math.sin(s * 3 + fase) * .04;
  };
  for (const r of Object.values(obj.placas)) pulsar(r.userData.marcador, r.userData.fase * .17);
  for (const e of Object.values(obj.epis)) pulsar(e.userData.marcador, e.userData.fase * .13);
  pulsar(obj.marcaSaida, 0);
  if (obj.grua) {
    const { carga, cabo, dist, H, luz } = obj.grua.userData;
    const yCarga = 1.55 + Math.sin(s * .5) * .3;          // sobe e desce devagar
    carga.position.set(dist + Math.sin(s * .9) * .06, yCarga - H, Math.cos(s * .7) * .06);
    carga.rotation.y = Math.sin(s * .4) * .5;
    const topoCabo = .3, baseCabo = yCarga - H + .58;
    cabo.scale.y = topoCabo - baseCabo;
    cabo.position.y = (topoCabo + baseCabo) / 2;
    luz.material.emissiveIntensity = Math.sin(s * 4) > 0 ? 2 : .2;
  }
  for (const c of obj.colegas) {
    const [bE, bD] = c.userData.bracos, f = c.userData.fase;
    if (c.userData.tipo === 'martelo') { bD.rotation.x = -1.2 + Math.abs(Math.sin(s * 5 + f)) * 1.1; bE.rotation.x = -.5; }
    else if (c.userData.tipo === 'pa') { const t = Math.sin(s * 2 + f); bD.rotation.x = -.6 + t * .5; bE.rotation.x = -.8 + t * .4; c.userData.corpo.rotation.x = .15 + t * .1; }
    else { bD.rotation.x = bE.rotation.x = -.9; c.userData.corpo.position.y = Math.abs(Math.sin(s * 1.5 + f)) * .015; }
  }
  if (jogo) for (const b of obj.caminhoes) {
    b.userData.tambor.rotation.x = s * 3;
    b.userData.giroflex.material.emissiveIntensity = (Math.sin(s * 10) > 0) ? 1.4 : .2;
    const j = jogo.jogador, y = b.position.z;
    const frente = b.position.x + b.userData.dir * .9;
    // para antes da faixa se o boneco esta nela ou bem perto dela
    const parar = b.userData.faixas.some(fx => Math.abs(j.x - fx) <= 0 && Math.abs(j.y - y) <= 1
      && Math.sign(fx - b.position.x) === b.userData.dir && Math.abs(fx - frente) < .6);
    if (!parar) b.position.x += b.userData.dir * dt * 1.3;
    if (b.position.x > jogo.w + 1) b.userData.dir = -1;
    if (b.position.x < -2) b.userData.dir = 1;
    b.rotation.y = b.userData.dir > 0 ? 0 : Math.PI;
  }
  if (obj.jogador) obj.jogador.userData.voce.scale.setScalar(1 + Math.sin(s * 4) * .08);
  if (obj.jogador && !movendo) {
    obj.jogador.userData.corpo.position.y = Math.abs(Math.sin(s * 2.2)) * .02;
    for (const b of obj.jogador.userData.bracos) b.rotation.x = Math.sin(s * 2.2) * .05;
  }
  posicionarCamera(true);
  if (tremor > 0) {
    camera.position.x += (Math.random() - .5) * tremor;
    camera.position.y += (Math.random() - .5) * tremor;
    tremor = Math.max(0, tremor - .012);
  }
  renderer.render(cena, camera);
}

// ---------- efeitos ----------
async function animarPasso(x, y) {
  const j = obj.jogador;
  const de = j.position.clone();
  const dx = x - de.x, dz = y - de.z, y1 = yDe(x, y);
  j.rotation.y = Math.atan2(dx, dz);
  movendo = true;
  const { pernas, bracos, corpo } = j.userData;
  await tween(190, p => {
    const q = suave(p);
    j.position.x = de.x + dx * q;
    j.position.z = de.z + dz * q;
    j.position.y = de.y + (y1 - de.y) * q;
    // passada: pernas e bracos alternados, com um pulinho curto
    const passo = Math.sin(p * Math.PI * 2) * .7;
    pernas[0].rotation.x = passo; pernas[1].rotation.x = -passo;
    bracos[0].rotation.x = -passo * .8; bracos[1].rotation.x = passo * .8;
    corpo.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * .06;
  });
  for (const m of [...pernas, ...bracos]) m.rotation.x = 0;
  corpo.position.y = 0;
  movendo = false;
}

const CONFETE = [0xf2c200, 0x2ecc71, 0x3fa9f5, 0xff7a1a, 0xffffff];
function explosao(x, y, cor, n = 16) {
  const geo = new THREE.BoxGeometry(.08, .02, .06);
  const mats = [cor, ...CONFETE].map(c => new THREE.MeshBasicMaterial({ color: c }));
  const y0 = yDe(x, y) + .55;
  const parts = Array.from({ length: n }, (_, i) => {
    const m = new THREE.Mesh(geo, cor === COR.perigo ? mats[0] : mats[i % mats.length]);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    m.position.set(x, y0, y);
    m.userData.v = new THREE.Vector3((Math.random() - .5) * 3, 2 + Math.random() * 2, (Math.random() - .5) * 3);
    mundo.add(m);
    return m;
  });
  tween(750, p => {
    for (const m of parts) {
      const t = p * .75;
      m.position.set(x + m.userData.v.x * t, y0 + m.userData.v.y * t - 4.9 * t * t, y + m.userData.v.z * t);
      m.scale.setScalar(1 - p);
    }
  }).then(() => parts.forEach(m => mundo.remove(m)));
}

async function sumir(lista, k, cor) {
  const o = lista[k];
  if (!o) return;
  delete lista[k];
  o.userData.saindo = true;
  explosao(o.position.x, o.position.z, cor);
  await tween(350, p => o.scale.setScalar(Math.max(.001, 1 - p)));
  mundo.remove(o);
}

function liberarSaida() {
  const { tapete, placa } = obj.saida.userData;
  tapete.material.color.set(COR.ok); tapete.material.opacity = .5;
  placa.material.emissive = new THREE.Color(COR.ok); placa.material.emissiveIntensity = .6;
  if (!obj.marcaSaida) {
    obj.marcaSaida = marcador(COR.ok, 2.4);
    obj.saida.add(obj.marcaSaida);
  }
}

function piscar() {
  const f = $('#flash');
  f.classList.remove('ativo'); void f.offsetWidth; f.classList.add('ativo');
  tremor = .15;
  try { navigator.vibrate?.(200); } catch (e) {}
}

function toast(texto, tipo = '', ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = texto;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 2) $('#toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('saindo'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- HUD ----------
const SVG_CAPACETE = '<svg class="capacete" viewBox="0 0 26 22" aria-hidden="true"><path d="M3 16a10 10 0 0 1 20 0z" fill="#eec100"/><rect x="11" y="4" width="4" height="9" rx="1.5" fill="#d4a900"/><rect x="1" y="16" width="24" height="3.5" rx="1.7" fill="#eec100"/></svg>';
let ultimosPontos = 0;
function atualizarHUD() {
  if (!jogo) return;
  $('#hud-capacetes').innerHTML = Array.from({ length: 3 }, (_, i) =>
    SVG_CAPACETE.replace('class="capacete"', `class="capacete${i < jogo.capacetes ? '' : ' perdido'}"`)).join('');
  const pts = $('#hud-pontos');
  pts.textContent = pontosAtuais();
  if (pontosAtuais() !== ultimosPontos) { pts.classList.remove('pulso'); void pts.offsetWidth; pts.classList.add('pulso'); }
  ultimosPontos = pontosAtuais();
  $('#hud-placas').textContent = `${8 - pendentes()}/8`;
  $('#hud-epis').innerHTML = Object.keys(EPI).map(k =>
    `<span class="epi${jogo.tenho[k] ? ' tenho' : ''}" title="${C.epis[k].nome}">${C.epis[k].emoji}</span>`).join('');
  missao();
}

// frase de baixo: sempre diz o que fazer agora
function missao() {
  const el = $('#missao');
  const faltam = pendentes();
  if (jogo.fim) el.textContent = 'Partida encerrada';
  else if (faltam === 8 && jogo.episPegos === 0) el.textContent = '👆 Toque no chão para andar. Pegue os EPIs e responda as placas ⚠️';
  else if (faltam > 0) el.textContent = `⚠️ Faltam ${faltam} placa${faltam > 1 ? 's' : ''} para responder`;
  else el.textContent = '🚩 Tudo respondido! Vá até o PONTO DE ENCONTRO';
}

// ---------- janelas ----------
const modal = $('#modal');
const conteudo = $('#modal-conteudo');
const modalAberto = () => !modal.classList.contains('oculto');
function abrirModal(html) { conteudo.innerHTML = html; modal.classList.remove('oculto'); conteudo.scrollTop = 0; }
function fecharModal() { modal.classList.add('oculto'); conteudo.innerHTML = ''; }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function lerLocal(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function gravarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

async function telaEntrada(obras) {
  abrirModal(`
    <div class="logo">
      <div class="capacete-logo">👷</div>
      <span class="selo">SIPAT</span>
      <h1>Canteiro Seguro</h1>
      <p class="sub">Aprenda sobre segurança e saúde no canteiro de obras jogando!</p>
    </div>
    <form id="f-entrada" novalidate>
      <label class="campo">Seu nome completo
        <input id="i-nome" autocomplete="name" maxlength="100" placeholder="Ex.: João da Silva" value="${esc(jogador.nome)}">
      </label>
      <label class="campo">Sua obra
        <select id="i-obra"><option value="">Escolha a obra…</option>${obras.map(o => `<option${o === jogador.obra ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>
      </label>
      <div class="erro-campo" id="e-entrada"></div>
      <div class="pilha">
        <button class="btn btn-amarelo" type="submit">▶ Começar</button>
        <a class="btn" href="${URL_RANKING}">🏆 Ver o ranking</a>
      </div>
      ${DEMO ? '<p class="sub" style="text-align:center;font-size:14px">Versão de demonstração: o ranking fica salvo só neste aparelho.</p>' : ''}
    </form>`);
  $('#f-entrada').onsubmit = ev => {
    ev.preventDefault();
    const nome = $('#i-nome').value.trim().replace(/\s+/g, ' ');
    const obra = $('#i-obra').value;
    if (nome.split(' ').length < 2 || nome.length < 5) { $('#e-entrada').textContent = 'Escreva o nome completo (nome e sobrenome).'; $('#i-nome').focus(); return; }
    if (!obra) { $('#e-entrada').textContent = 'Escolha a sua obra.'; $('#i-obra').focus(); return; }
    jogador = { nome, obra };
    gravarLocal('sipat_nome', nome); gravarLocal('sipat_obra', obra);
    if (!lerLocal('sipat_viu_tutorial')) tutorial(0, comecarPartida);
    else comecarPartida();
  };
}

const TUTORIAL = [
  ['👆', 'Toque no chão para andar', 'O seu personagem vai sozinho até onde você tocar.'],
  ['🦺', 'Pegue os EPIs', 'Cada área colorida pede um EPI: altura (cinto), ruído (protetor auricular), solda (óculos) e químicos (luvas). Sem ele, você não entra.'],
  ['⚠️', 'Responda as placas', 'Cada placa amarela mostra uma situação do dia a dia. Escolha a atitude mais segura. Errar uma situação grave custa um capacete ⛑️.'],
  ['🚩', 'Chegue ao ponto de encontro', 'Depois de responder as 8 placas, vá até o ponto de encontro. Atravesse a rua só pela faixa de pedestre!'],
];
function tutorial(i, depois) {
  const [emoji, titulo, texto] = TUTORIAL[i];
  const ultimo = i === TUTORIAL.length - 1;
  abrirModal(`
    <div class="grande">${emoji}</div>
    <h2 style="text-align:center">${titulo}</h2>
    <p style="text-align:center">${texto}</p>
    <div class="passos">${TUTORIAL.map((_, k) => `<i class="${k === i ? 'ativo' : ''}"></i>`).join('')}</div>
    <div class="pilha">
      <button class="btn btn-amarelo" id="b-prox">${ultimo ? '✅ Entendi, vamos lá!' : 'Próximo →'}</button>
      ${ultimo ? '' : '<button class="link" id="b-pular">Pular explicação</button>'}
    </div>`);
  const fim = () => { gravarLocal('sipat_viu_tutorial', '1'); fecharModal(); depois?.(); };
  $('#b-prox').onclick = () => ultimo ? fim() : tutorial(i + 1, depois);
  const pular = $('#b-pular');
  if (pular) pular.onclick = fim;
}

function comecarPartida() {
  fecharModal();
  novaPartida();
  construir();
  posicionarCamera(false);
  ultimosPontos = 0;
  atualizarHUD();
  toast('👆 Toque no chão para andar', '', 2500);
}

function modalEpi(tipo) {
  const e = C.epis[tipo];
  abrirModal(`
    <div class="grande">${e.emoji}</div>
    <h2 style="text-align:center">Você pegou: ${esc(e.nome)}</h2>
    <p style="text-align:center"><b>+25 pontos</b></p>
    <p>${esc(e.protege)}</p>
    <p class="sub">Agora você pode entrar na área de <b>${esc(e.area)}</b>.</p>
    <div class="pilha"><button class="btn btn-amarelo" id="b-ok">Vestir e continuar</button></div>`);
  $('#b-ok').onclick = fecharModal;
}

const LETRAS = ['A', 'B', 'C'];
function modalPlaca(k) {
  const p = jogo.placas[k], it = p.item;
  const saude = p.item.tema === 'saude';
  abrirModal(`
    <div class="placa${saude ? ' saude' : ''}">
      <div class="placa-tema">${saude ? '💚 Saúde' : '⚠️ Segurança'} · placa ${9 - pendentes()} de 8</div>
      <h2>${esc(it.titulo)}</h2>
      <p>${esc(it.cena)}</p>
    </div>
    <p class="pergunta">O que você faz?</p>
    <div class="opcoes">
      ${p.ordem.map((o, i) => `<button class="opcao" data-o="${o}"><b>${LETRAS[i]}</b><span>${esc(it.opcoes[o])}</span></button>`).join('')}
    </div>
    <div id="c-resposta"></div>`);
  conteudo.querySelectorAll('.opcao').forEach(b => { b.onclick = () => responder(k, Number(b.dataset.o)); });
}

function responder(k, escolha) {
  const p = jogo.placas[k], it = p.item;
  if (p.status !== 'pendente') return;
  const certo = escolha === it.certa;
  p.status = certo ? 'certo' : 'errado';
  jogo.respostas.push({ id: it.id, certo, titulo: it.titulo, certa: it.opcoes[it.certa], porque: it.porque });
  conteudo.querySelectorAll('.opcao').forEach(b => {
    const o = Number(b.dataset.o);
    b.disabled = true;
    if (o === it.certa) b.classList.add('certa');
    else if (o === escolha) b.classList.add('errada');
    else b.classList.add('apagada');
  });
  let titulo;
  if (certo) {
    jogo.acertos++;
    titulo = '✅ Isso mesmo! +100 pontos';
  } else if (it.grave) {
    jogo.capacetes--;
    titulo = '⛑️ Essa atitude poderia causar um acidente grave. Você perdeu um capacete.';
    piscar();
  } else {
    titulo = '❌ Não é a atitude mais segura.';
  }
  $('#c-resposta').innerHTML = `
    <div class="resposta ${certo ? 'ok' : 'ruim'}">
      <h3>${titulo}</h3>
      ${certo ? '' : `<p><b>O certo é:</b> ${esc(it.opcoes[it.certa])}</p>`}
      <p>${esc(it.porque)}</p>
    </div>
    <div class="pilha"><button class="btn btn-amarelo" id="b-cont">Continuar</button></div>`;
  // rola so a janela da placa (scrollIntoView rolava a pagina inteira no celular e cortava o topo)
  conteudo.scrollTo({ top: conteudo.scrollHeight, behavior: 'smooth' });
  sumir(obj.placas, k, certo ? COR.ok : COR.perigo);
  if (certo) explosao(...k.split(',').map(Number), COR.amarelo, 10);
  atualizarHUD();
  $('#b-cont').onclick = () => {
    fecharModal();
    if (jogo.capacetes <= 0) return terminar('derrota');
    if (pendentes() === 0) { liberarSaida(); toast('🚩 Todas as placas respondidas! Agora vá ao PONTO DE ENCONTRO.', 'ok', 4000); }
  };
}

// ---------- movimento ----------
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
function liberado(x, y) {
  const c = jogo.grade[y]?.[x];
  if (c === undefined || c === '#' || c === 'g' || c === 'v') return false;
  const z = ZONAS[c]?.epi;
  return !z || jogo.tenho[z];
}

// Caminho mais curto ate o alvo, sem atravessar placa/EPI que nao seja o destino (se der).
function caminho(alvo, evitarObjetos = true) {
  const destino = chave(alvo.x, alvo.y);
  const origem = chave(jogo.jogador.x, jogo.jogador.y);
  const veio = { [origem]: null };
  const fila = [[jogo.jogador.x, jogo.jogador.y]];
  while (fila.length) {
    const [x, y] = fila.shift();
    if (chave(x, y) === destino) break;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = chave(nx, ny);
      if (k in veio || !liberado(nx, ny)) continue;
      if (evitarObjetos && k !== destino && (jogo.placas[k]?.status === 'pendente' || jogo.epis[k] || (nx === jogo.saida.x && ny === jogo.saida.y))) continue;
      veio[k] = chave(x, y);
      fila.push([nx, ny]);
    }
  }
  if (!(destino in veio) || destino === origem) return null;
  const passos = [];
  for (let k = destino; veio[k]; k = veio[k]) passos.unshift(k.split(',').map(Number));
  return passos;
}

let andando = false;
async function irPara(x, y) {
  if (andando || !jogo || jogo.fim || modalAberto()) return;
  const c = jogo.grade[y]?.[x];
  if (c === undefined || c === '#') return;
  if (c === 'g') {
    if (!jogo.viuIsolada) {
      jogo.viuIsolada = true;
      abrirModal(`<div class="grande">🏗️</div><h2 style="text-align:center">${esc(C.isolada.titulo)}</h2><p>${esc(C.isolada.texto)}</p>
        <div class="pilha"><button class="btn btn-amarelo" id="b-ok">Entendi</button></div>`);
      $('#b-ok').onclick = fecharModal;
    } else toast('🏗️ Área isolada: nunca passe embaixo de carga suspensa.', 'ruim');
    return;
  }
  if (c === 'v') return toast('🚸 Atravesse a rua só pela faixa de pedestre (as listras brancas).', 'ruim');
  const precisa = ZONAS[c]?.epi;
  if (precisa && !jogo.tenho[precisa]) {
    const e = C.epis[precisa];
    return toast(`${e.emoji} Para entrar na área de ${e.area} você precisa: ${e.nome}. Procure-o no mapa!`, 'ruim', 4000);
  }
  if (x === jogo.saida.x && y === jogo.saida.y && pendentes() > 0) {
    return toast(`🚩 Antes de ir ao ponto de encontro, responda as placas que faltam (${pendentes()}).`, '', 3500);
  }
  const passos = caminho({ x, y }) || caminho({ x, y }, false);
  if (!passos) return toast('Ainda não dá para chegar aí. Pegue os EPIs que faltam!');
  andando = true;
  try {
    for (const [px, py] of passos) {
      await animarPasso(px, py);
      jogo.jogador = { x: px, y: py };
      const k = chave(px, py);
      if (jogo.epis[k]) {
        const tipo = jogo.epis[k];
        delete jogo.epis[k];
        jogo.tenho[tipo] = true;
        jogo.episPegos++;
        sumir(obj.epis, k, EPI[tipo].cor);
        vestirEpi();
        atualizarHUD();
        modalEpi(tipo);
        break;
      }
      if (jogo.placas[k]?.status === 'pendente') { modalPlaca(k); break; }
      if (px === jogo.saida.x && py === jogo.saida.y && pendentes() === 0) { terminar('vitoria'); break; }
    }
  } finally {
    andando = false;
  }
}

// anel branco que aparece e some na casa tocada: a pessoa ve que o toque "pegou"
function marcarToque(x, y) {
  if (!mundo || !jogo || jogo.fim || modalAberto()) return;
  const anel = new THREE.Mesh(new THREE.RingGeometry(.22, .34, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
  anel.rotation.x = -Math.PI / 2;
  anel.position.set(x, yDe(x, y) + .03, y);
  mundo.add(anel);
  tween(450, p => { anel.scale.setScalar(.6 + p * .8); anel.material.opacity = .9 * (1 - p); }).then(() => mundo.remove(anel));
}

// toque (sem arrastar) = andar ate a casa tocada
const raio = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
let toqueIni = null;
canvas.addEventListener('pointerdown', e => { toqueIni = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!toqueIni || Math.hypot(e.clientX - toqueIni[0], e.clientY - toqueIni[1]) > 12) return;
  toqueIni = null;
  const r = canvas.getBoundingClientRect();
  ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raio.setFromCamera(ponteiro, camera);
  const hit = obj.alvoToque && raio.intersectObject(obj.alvoToque, false)[0];
  if (!hit) return;
  const x = Math.round(hit.point.x), y = Math.round(hit.point.z);
  if (x < 0 || y < 0 || x >= jogo.w || y >= jogo.h) return;
  marcarToque(x, y);
  irPara(x, y);
});
// no computador, setas tambem funcionam
addEventListener('keydown', e => {
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
  if (!d || !jogo) return;
  e.preventDefault();
  irPara(jogo.jogador.x + d[0], jogo.jogador.y + d[1]);
});
$('#b-ajuda').onclick = () => { if (!andando) tutorial(0, null); };

// ---------- fim da partida ----------
async function terminar(resultado) {
  jogo.fim = resultado;
  const duracao = Math.round((Date.now() - jogo.t0) / 1000);
  const bonus = resultado === 'vitoria' ? jogo.capacetes * 50 : 0;
  const total = pontosAtuais() + bonus;
  missao();
  if (resultado === 'vitoria') { explosao(jogo.saida.x, jogo.saida.y, COR.ok, 30); explosao(jogo.saida.x, jogo.saida.y, COR.amarelo, 30); }
  await esperar(600);
  abrirModal(`
    <div class="grande">${resultado === 'vitoria' ? '🏆' : '⛑️'}</div>
    <h1 style="text-align:center">${resultado === 'vitoria' ? 'Você chegou com segurança!' : 'Seus capacetes acabaram'}</h1>
    <p class="sub" style="text-align:center">${resultado === 'vitoria' ? 'Parabéns! Você terminou o canteiro.' : 'Tudo bem: o importante é aprender. Veja abaixo as respostas e tente de novo!'}</p>
    <div class="placar">
      <div><span>✅ Placas certas: ${jogo.acertos} de 8</span><b>${jogo.acertos * 100}</b></div>
      <div><span>🦺 EPIs pegos: ${jogo.episPegos} de 4</span><b>${jogo.episPegos * 25}</b></div>
      <div><span>⛑️ Capacetes que sobraram: ${resultado === 'vitoria' ? jogo.capacetes : 0}</span><b>${bonus}</b></div>
      <div class="total"><span>Total</span><b>${total}</b></div>
    </div>
    <div class="posicao" id="posicao">Salvando sua pontuação…</div>
    <div class="pilha">
      <button class="btn btn-amarelo" id="b-denovo">🔁 Jogar de novo</button>
      <button class="btn" id="b-aprendi">📚 Ver o que aprendi</button>
      <a class="btn" href="${URL_RANKING}">🏆 Ver o ranking</a>
    </div>`);
  $('#b-denovo').onclick = comecarPartida;
  $('#b-aprendi').onclick = () => telaAprendi(resultado);
  salvar(resultado, duracao);
}

async function salvar(resultado, duracao) {
  const el = () => $('#posicao');
  try {
    const dados = {
      action: 'salvar', nome: jogador.nome, obra: jogador.obra, resultado, duracao_seg: duracao,
      acertos: jogo.acertos, epis: jogo.episPegos, capacetes: jogo.capacetes,
      respostas: jogo.respostas.map(x => ({ id: x.id, certo: x.certo })),
    };
    const d = DEMO ? SipatDemo.salvar(dados) : await fetch('api.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    }).then(r => r.json());
    if (d.error) throw new Error(d.error);
    if (el()) el().innerHTML = d.melhor
      ? `Sua melhor partida: <b>${d.melhor.pontos} pontos</b><br>Você está em <b>${d.melhor.posicao}º lugar</b> de ${d.jogadores}`
      : 'Pontuação salva!';
  } catch (e) {
    if (el()) {
      el().innerHTML = `Não deu para salvar (${esc(e.message)}). <button class="link" id="b-salvar">Tentar de novo</button>`;
      $('#b-salvar').onclick = () => { el().textContent = 'Salvando…'; salvar(resultado, duracao); };
    }
  }
}

function telaAprendi(resultado) {
  const pos = $('#posicao')?.innerHTML || '';
  abrirModal(`
    <h2>📚 O que você aprendeu</h2>
    <ul class="aprendi">
      ${jogo.respostas.map(r => `<li class="${r.certo ? '' : 'errou'}">
        <b>${r.certo ? '✅' : '❌'} ${esc(r.titulo)}</b>
        <div class="certa">Atitude certa: ${esc(r.certa)}</div>
        <small>${esc(r.porque)}</small></li>`).join('') || '<li>Você ainda não respondeu nenhuma placa.</li>'}
    </ul>
    <div class="pilha">
      <button class="btn btn-amarelo" id="b-denovo">🔁 Jogar de novo</button>
      <a class="btn" href="${URL_RANKING}">🏆 Ver o ranking</a>
    </div>`);
  $('#b-denovo').onclick = comecarPartida;
}

// ---------- inicio ----------
(async () => {
  requestAnimationFrame(laco);
  jogador = { nome: lerLocal('sipat_nome'), obra: lerLocal('sipat_obra') };
  try {
    const [c, o] = await Promise.all([
      fetch('assets/conteudo.json?v=' + Date.now()).then(r => r.json()),
      DEMO ? SipatDemo.obras() : fetch('api.php?action=obras').then(r => r.json()),
    ]);
    C = c;
    // canteiro de fundo enquanto a pessoa preenche o nome
    novaPartida();
    construir();
    posicionarCamera(false);
    jogo = { ...jogo, fim: 'espera' };
    telaEntrada(o.obras || []);
  } catch (e) {
    abrirModal(`<h2>Sem conexão</h2><p>Não foi possível carregar o jogo. Verifique a internet e tente de novo.</p>
      <div class="pilha"><button class="btn btn-amarelo" onclick="location.reload()">Tentar de novo</button></div>`);
  }
})();

// acesso para depuracao no console
window.sipat = { get jogo() { return jogo; }, irPara, get render() { return { ...renderer.info.render, ...renderer.info.memory }; } };
