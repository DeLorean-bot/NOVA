function castQuery(id) {
  return `SELECT DISTINCT ?actor ?actorLabel ?film ?filmLabel ?kp WHERE {
    { SELECT DISTINCT ?actor WHERE { ?watched wdt:P2603 "${id}"; wdt:P161 ?actor. } LIMIT 6 }
    ?film wdt:P161 ?actor; wdt:P2603 ?kp; wikibase:sitelinks ?links.
    FILTER(?kp != "${id}")
    SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
  } ORDER BY DESC(?links) LIMIT 32`;
}

function castCredits(body) {
  const actors = new Map();
  for (const row of body.results?.bindings ?? []) {
    const actor = row.actor?.value?.match(/\/Q\d+$/)?.[0];
    const name = row.actorLabel?.value;
    const title = row.filmLabel?.value;
    const id = Number(row.kp?.value);
    if (!actor || !name || !title || !/^[1-9]\d{0,11}$/.test(row.kp?.value) || /^Q\d+$/.test(title) || /^Q\d+$/.test(name)) continue;
    if (!actors.has(actor)) actors.set(actor, { name, titles: [] });
    const titles = actors.get(actor).titles;
    if (titles.length < 4 && !titles.some(item => item.id === id)) titles.push({ id, title });
  }
  return [...actors.values()].slice(0, 4);
}

module.exports = { castQuery, castCredits };
