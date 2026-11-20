const { test } = require('node:test');
const assert = require('node:assert/strict');
const { navigationGroup, visitSection, sectionForGroup } = require('../src/navigation-model.ts');
test('every existing screen belongs to an accessible top navigation group', () => {
  assert.deepEqual(['home','search','trending','films','series','releases','favorites','history'].map(navigationGroup), ['home','catalog','catalog','catalog','catalog','releases','library','library']);
});
test('a top-level group returns to its last visited subsection', () => {
  let history = {entries:['home'],index:0};
  assert.equal(sectionForGroup(history,'catalog'),'films');
  history=visitSection(history,'series'); history=visitSection(history,'favorites');
  assert.equal(sectionForGroup(history,'catalog'),'series');
  assert.equal(sectionForGroup(history,'library'),'favorites');
});
test('back then fresh navigation discards the forward branch without duplicate entries', () => {
  const old={entries:['home','films','history'],index:1};
  assert.equal(visitSection(old,'films'),old);
  assert.deepEqual(visitSection(old,'series'),{entries:['home','films','series'],index:2});
  let history=old;for(let i=0;i<100;i++)history=visitSection(history,i%2?'home':'films');
  assert.ok(history.entries.length<=64); assert.equal(history.index,history.entries.length-1);
});

test('search is a catalog destination and survives visiting the personal library', () => {
 let history={entries:['home'],index:0}; for(const section of ['films','search','history'])history=visitSection(history,section); assert.equal(sectionForGroup(history,'catalog'),'search'); assert.equal(navigationGroup('search'),'catalog');
});
