const { Worker, parentPort } = require('node:worker_threads');

if (parentPort) {
  const nspell = require('nspell');
  const dictionary = import('dictionary-ru').then(({ default: source }) => nspell(source)).catch(() => null);
  const consonants = word => word.replace(/[аеёиоуыэюяьъ]/gu, '');
  const corrections = new Map();

  parentPort.on('message', async ({ id, words }) => {
    const spell = await dictionary;
    let remaining = 5;
    const corrected = spell ? words.map(word => {
      if (!/^[а-яё]{4,22}$/u.test(word) || spell.correct(word)) return word;
      if (corrections.has(word)) return corrections.get(word);
      if (!remaining) return word;
      remaining--;
      const suggestions = spell.suggest(word).filter(option => /^[а-яё]+$/u.test(option));
      const replacement = suggestions.find(option => consonants(option) === consonants(word)) ||
        suggestions.find(option => /^[вск]/u.test(word) && option === word.slice(1)) || word;
      corrections.set(word, replacement);
      if (corrections.size > 256) corrections.delete(corrections.keys().next().value);
      return replacement;
    }) : words;
    const keywords = spell ? corrected.map(word => {
      if (!/^[а-яё]+$/u.test(word)) return word;
      const base = word.replace(/(?:ами|ями|ом|ем|ах|ях|у|ю|е)$/u, '');
      return base.length >= 3 && base !== word && spell.correct(base) ? base : word;
    }) : corrected;
    parentPort.postMessage({ id, corrected, keywords });
  });
} else {
  let worker, nextRequest = 0;
  const pending = new Map();

  async function correctPlotSpelling(words) {
    if (!worker) {
      const instance = new Worker(__filename);
      worker = instance;
      const release = () => {
        if (worker !== instance) return;
        worker = undefined;
        for (const resolve of pending.values()) resolve(undefined);
        pending.clear();
      };
      instance.on('error', release);
      instance.on('exit', release);
      instance.on('message', ({ id, corrected, keywords }) => {
        const resolve = pending.get(id);
        pending.delete(id);
        if (!pending.size) instance.unref();
        resolve?.({ corrected, keywords });
      });
    }
    return new Promise(resolve => {
      const id = ++nextRequest;
      pending.set(id, resolve);
      worker.ref();
      worker.postMessage({ id, words });
    });
  }

  module.exports = { correctPlotSpelling };
}
