// ---------------------------------------------------------------------------
// Utilitário de comparação "aproximada" de nomes (Cliente / Obra).
//
// Objetivo: quando importamos uma Proforma de Excel, o nome do cliente escrito
// no ficheiro raramente é 100% idêntico ao nome já cadastrado no sistema —
// pode ter uma letra trocada, faltar/sobrar acentos, ou vir só com 2 das 3
// palavras do nome completo. Esta função tenta encontrar o registo mais
// parecido em vez de exigir uma correspondência exata.
// ---------------------------------------------------------------------------

function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Normaliza um nome: remove acentos, baixa para minúsculas, remove pontuação
 *  e colapsa espaços extra. Útil também fora deste ficheiro para comparações simples. */
export function normalizeName(value) {
  return stripAccents(String(value || ''))
    .toLowerCase()
    .replace(/[.,;:'"()/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(name) {
  return normalizeName(name).split(' ').filter(Boolean)
}

// Distância de Levenshtein (nº mínimo de edições — inserir/apagar/trocar letra —
// para transformar uma string na outra).
function levenshtein(a, b) {
  if (a === b) return 0
  const al = a.length
  const bl = b.length
  if (!al) return bl
  if (!bl) return al

  let prev = new Array(bl + 1)
  let curr = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j

  for (let i = 1; i <= al; i++) {
    curr[0] = i
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[bl]
}

/** Similaridade 0..1 entre duas strings (1 = idênticas), baseada em Levenshtein. */
function stringSimilarity(a, b) {
  if (!a && !b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (!maxLen) return 1
  return 1 - levenshtein(a, b) / maxLen
}

/** Maior similaridade entre o token `t` e qualquer token de `tokens`
 *  (tolera pequenos erros de escrita por palavra, ex.: "Ferreria" ~ "Ferreira"). */
function bestTokenSimilarity(t, tokens) {
  let best = 0
  for (const other of tokens) {
    const sim = stringSimilarity(t, other)
    if (sim > best) best = sim
  }
  return best
}

/**
 * Calcula um score de 0 a 1 indicando o quanto `candidate` parece ser o mesmo
 * nome que `target`, tolerando:
 *  - acentos, maiúsculas/minúsculas, espaços extra e pontuação;
 *  - pequenos erros de digitação letra a letra;
 *  - nomes incompletos (ex.: candidato só com 2 das 3 palavras do nome registado).
 */
export function nameSimilarity(target, candidate) {
  const normTarget = normalizeName(target)
  const normCandidate = normalizeName(candidate)
  if (!normTarget || !normCandidate) return 0
  if (normTarget === normCandidate) return 1

  // Um nome "contém" o outro por completo (ex.: "Silva" dentro de "Empresa Silva Lda").
  const containment = normTarget.includes(normCandidate) || normCandidate.includes(normTarget) ? 0.15 : 0

  const targetTokens = tokenize(target)
  const candidateTokens = tokenize(candidate)
  const [shorter, longer] =
    targetTokens.length <= candidateTokens.length ? [targetTokens, candidateTokens] : [candidateTokens, targetTokens]

  // Para cada palavra do nome mais curto, procura a palavra mais parecida no nome
  // mais longo — assim "Joao Silva" casa bem com "Joao Manuel Silva Santos".
  const tokenScores = shorter.map((t) => bestTokenSimilarity(t, longer))
  const avgTokenScore = tokenScores.length ? tokenScores.reduce((s, v) => s + v, 0) / tokenScores.length : 0

  // Proporção de palavras do nome mais curto encontradas com boa confiança (>= 0.75).
  const strongMatches = tokenScores.filter((s) => s >= 0.75).length
  const coverage = shorter.length ? strongMatches / shorter.length : 0

  const wholeStringScore = stringSimilarity(normTarget, normCandidate)

  const score = Math.max(wholeStringScore, avgTokenScore * 0.7 + coverage * 0.3 + containment)

  return Math.min(1, score)
}

/**
 * Procura, numa lista de registos, o que melhor corresponde a `name`.
 * `getName(item)` extrai o nome de cada item da lista.
 * Devolve `{ item, score }` do melhor candidato (mesmo que o score seja baixo),
 * ou `null` se `name` ou `list` estiverem vazios. Quem chama decide, a partir
 * do score, se aceita automaticamente ou apenas sugere ao utilizador.
 */
export function findBestNameMatch(name, list, getName) {
  const normName = normalizeName(name)
  if (!normName || !list?.length) return null

  let best = null
  for (const item of list) {
    const score = nameSimilarity(name, getName(item))
    if (!best || score > best.score) best = { item, score }
  }
  return best
}

// A partir deste score (0..1) consideramos que é "quase de certeza" o mesmo
// nome e associamos automaticamente, sem pedir confirmação ao utilizador.
// Pode ser ajustado: mais alto = mais rigoroso (menos falsos positivos),
// mais baixo = mais tolerante (associa mais, mas com mais risco de erro).
export const AUTO_MATCH_THRESHOLD = 0.72