const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readProfile, patchProfile, profileName, MAX_AVATAR_BYTES } = require('../electron/profile.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const avatar = 'data:image/png;base64,'+png.toString('base64');
const decode = () => ({ isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>png });
test('old libraries migrate to a local profile; valid stored names and avatars survive reload',()=>{
  assert.deepEqual(readProfile(undefined,decode),{name:'Моя NOVA',avatar:''});
  const profile=patchProfile(readProfile(null,decode),{name:'  Кино  🍿  ',avatar},decode);
  assert.deepEqual(readProfile(JSON.parse(JSON.stringify(profile)),decode),{name:'Кино 🍿',avatar});
});
test('profile patches preserve the other field and can remove a photo',()=>{
  const current={name:'Кадр',avatar};
  assert.deepEqual(patchProfile(current,{name:'Другой ник'},decode),{name:'Другой ник',avatar});
  assert.deepEqual(patchProfile(current,{avatar:''},decode),{name:'Кадр',avatar:''});
  assert.deepEqual(current,{name:'Кадр',avatar});
});
test('names support Cyrillic and emoji and reject empty, oversized and direction-control input',()=>{
  assert.equal(profileName('Кино 🎬'),'Кино 🎬');
  for(const value of ['', '  ', 'а'.repeat(41), 'имя\u202e', null, 13]) assert.throws(()=>profileName(value));
  assert.equal(profileName('е\u0308'), 'ё');
});
test('avatar IPC rejects external URLs, SVG, oversized or undecodable data and mismatched dimensions',()=>{
  for(const value of ['https://example.com/a.png','file:///a.png','data:image/svg+xml,<svg/>',avatar+'!','data:image/png;base64,'+'a'.repeat(MAX_AVATAR_BYTES*2)]) assert.throws(()=>patchProfile({name:'Кадр',avatar:''},{avatar:value},decode));
  assert.throws(()=>patchProfile({name:'Кадр',avatar:''},{avatar},()=>({isEmpty:()=>true})));
  assert.throws(()=>patchProfile({name:'Кадр',avatar:''},{avatar},()=>({isEmpty:()=>false,getSize:()=>({width:400,height:400})})));
  const giant=Buffer.from(png);giant.writeUInt32BE(100000,16);
  assert.throws(()=>patchProfile({name:'Кадр',avatar:''},{avatar:'data:image/png;base64,'+giant.toString('base64')},decode));
  assert.throws(()=>patchProfile({name:'Кадр',avatar:''},{theme:'dark'},decode));
  assert.deepEqual(readProfile({name:'',avatar:'https://example.com'},decode),{name:'Моя NOVA',avatar:''});
});
