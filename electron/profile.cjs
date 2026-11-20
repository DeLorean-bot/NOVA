const DEFAULT_NAME = 'Моя NOVA';
const MAX_AVATAR_BYTES = 400 * 1024;
function profileName(value) {
  if (typeof value !== 'string') throw new Error('Введите ник');
  const name = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!name || [...name].length > 40 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(name)) throw new Error('Ник должен содержать от 1 до 40 символов');
  return name;
}
function profileAvatar(value, decode) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 22 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Выберите изображение PNG, JPEG или WebP');
  const bytes = Buffer.from(value.slice(22), 'base64');
  if (bytes.length < 33 || bytes.length > MAX_AVATAR_BYTES || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16) !== 'IHDR') throw new Error('Не удалось прочитать аватарку');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 256 || height > 256) throw new Error('Слишком большое изображение');
  const image = decode(value);
  if (image.isEmpty()) throw new Error('Не удалось прочитать аватарку');
  const size = image.getSize();
  if (size.width !== width || size.height !== height) throw new Error('Не удалось прочитать аватарку');
  return `data:image/png;base64,${image.toPNG().toString('base64')}`;
}
function readProfile(raw, decode) {
  let name = DEFAULT_NAME, avatar = '';
  try { name = profileName(raw?.name); } catch {}
  if (name === 'Мой Кадр') name = DEFAULT_NAME;
  try { avatar = profileAvatar(raw?.avatar || '', decode); } catch {}
  return { name, avatar };
}
function patchProfile(current, patch, decode) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['name','avatar'].includes(key))) throw new Error('Некорректные данные профиля');
  return { name: 'name' in patch ? profileName(patch.name) : current.name, avatar: 'avatar' in patch ? profileAvatar(patch.avatar, decode) : current.avatar };
}
module.exports = { readProfile, patchProfile, profileName, MAX_AVATAR_BYTES };
