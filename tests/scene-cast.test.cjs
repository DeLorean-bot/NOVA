const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plexCast, wikidataCast } = require('../electron/scene-cast.cjs');

test('portrait credits match the title and year and accept only known portrait URLs', () => {
  const photo = 'https://metadata-static.plex.tv/a/people/0123456789abcdef.jpg';
  const tile = (title, image) => ({ title, subtitles: ['Colter Shaw / Producer'], image: { url: image }, link: { url: '/person/sample' } });
  const credits = [{ sections: { content: [{ content: [tile('Justin Hartley', photo), tile('Unknown', 'https://example.test/photo.jpg')] }] } }];
  const line = '1c:' + JSON.stringify(['$', '$L86', null, { screen: { ui: { credits } } }]) + '\n';
  const html = '<meta property="og:title" content="Tracker (2024) Full Cast &amp; Crew - Plex"/>' +
    '<script>self.__next_f.push([0])</script><script>self.__next_f.push(' + JSON.stringify([1, line]) + ')</script>';
  assert.deepEqual(plexCast(html, 'Tracker', 2024), [{ name: 'Justin Hartley', role: 'Colter Shaw', photos: [photo] }]);
  assert.deepEqual(plexCast(html, 'Tracker', 2001), []);
  assert.deepEqual(plexCast(html, 'Trackers', 2024), []);
});

test('Wikidata portraits retain localized names and omit unlabelled credits', () => {
  const literal = value => ({ value });
  const wikimedia = 'http://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg';
  const bindings = [
    { actorLabel: literal('Джастин Хартли'), english: literal('Justin Hartley'), characterLabel: literal('Колтер Шоу'), image: literal(wikimedia) },
    { actorLabel: literal('Q123'), image: literal(wikimedia) },
  ];
  assert.deepEqual(wikidataCast({ results: { bindings } }), [{ name: 'Justin Hartley', localized: 'Джастин Хартли',
    role: 'Колтер Шоу', photos: ['https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=320'] }]);
});
