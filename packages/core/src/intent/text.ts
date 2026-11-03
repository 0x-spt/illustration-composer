/** Endings stripped by `stem`, longest first. A stem keeps at least MIN_STEM letters. */
export const ENDINGS: readonly string[] = [
  'ами',
  'ями',
  'ого',
  'его',
  'ому',
  'ему',
  'ыми',
  'ими',
  'ешь',
  'ишь',
  'ете',
  'ите',
  'ать',
  'ять',
  'еть',
  'ить',
  'ают',
  'яют',
  'ует',
  'ов',
  'ев',
  'ей',
  'ой',
  'ом',
  'ем',
  'ам',
  'ям',
  'ах',
  'ях',
  'ью',
  'ую',
  'юю',
  'ая',
  'яя',
  'ое',
  'ее',
  'ые',
  'ие',
  'ый',
  'ий',
  'им',
  'ым',
  'ет',
  'ут',
  'ют',
  'ит',
  'ят',
  'а',
  'я',
  'ы',
  'и',
  'у',
  'ю',
  'е',
  'о',
  'ь',
  'й',
];

const MIN_STEM = 3;

/** Words that carry no meaning for matching: particles, prepositions, numerals. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'и',
  'а',
  'но',
  'или',
  'в',
  'во',
  'на',
  'с',
  'со',
  'к',
  'ко',
  'по',
  'для',
  'из',
  'от',
  'до',
  'за',
  'о',
  'об',
  'про',
  'при',
  'без',
  'над',
  'под',
  'у',
  'же',
  'бы',
  'не',
  'ни',
  'то',
  'еще',
  'как',
  'что',
  'это',
  'мой',
  'наш',
  'нам',
  'мы',
  'я',
  'ты',
  'вы',
  'он',
  'она',
  'они',
  'нужно',
  'надо',
  'один',
  'одна',
  'одно',
  'два',
  'две',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
  'десять',
  'пара',
  'пару',
  'несколько',
  'много',
  'мало',
]);

export function stem(word: string): string {
  for (const ending of ENDINGS) {
    if (word.length - ending.length >= MIN_STEM && word.endsWith(ending)) {
      return word.slice(0, word.length - ending.length);
    }
  }
  return word;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 0);

/**
 * Words of `text` without stopwords, each with its stem: lowercase, ё→е, split on non-letters,
 * endings truncated.
 */
export function contentWords(text: string): { raw: string; stem: string }[] {
  return words(text)
    .filter((w) => !STOPWORDS.has(w))
    .map((raw) => ({ raw, stem: stem(raw) }));
}

/** Damerau-Levenshtein distance (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}
