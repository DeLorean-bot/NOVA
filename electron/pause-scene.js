const panel = document.querySelector('main');
const texture = document.createElement('div');
texture.className = 'pause-texture';
const backdrop = document.createElement('img');
backdrop.alt = '';
texture.append(backdrop);

window.setPauseBackdrop = ({ image, x, y, width, height }) => {
  Object.assign(backdrop.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
  backdrop.src = image;
};

function element(tag, value = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function drawSection(title, cards, emptyText, symbol) {
  const section = element('section');
  section.append(element('h2', title));
  if (!cards.length) {
    section.append(element('p', emptyText));
    return section;
  }
  const list = element('ul');
  for (const { name, detail, image } of cards) {
    const row = element('li');
    const art = element('span', symbol || name[0], 'art');
    art.setAttribute('aria-hidden', 'true');
    if (image) {
      const photo = element('img');
      photo.alt = '';
      photo.addEventListener('error', () => photo.remove(), { once: true });
      photo.src = image;
      art.append(photo);
    }
    const copy = element('span', '', 'copy');
    copy.append(element('strong', name));
    if (detail) copy.append(element('span', detail, 'secondary'));
    row.append(art, copy);
    list.append(row);
  }
  section.append(list);
  return section;
}

window.renderPauseScene = ({ language, theme, motion, time, actors, tracks, labels, compact, variant, age, warnings, label }) => {
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = motion ? 'on' : 'off';
  backdrop.removeAttribute('src');
  panel.classList.remove('warning');
  if (variant === 'warning') {
    void panel.offsetWidth;
    panel.classList.add('warning');
    panel.replaceChildren(texture);
    if (age) panel.append(element('strong', age + '+', 'age'));
    const copy = element('div', '', 'warnings');
    for (const warning of warnings?.length ? warnings : [label]) copy.append(element('span', warning));
    panel.append(copy);
    return panel.offsetHeight + 4;
  }
  const whole = Math.max(0, Math.floor(time));
  const parts = [Math.floor(whole / 60) % 60, whole % 60].map(part => String(part).padStart(2, '0'));
  if (whole >= 3600) parts.unshift(String(Math.floor(whole / 3600)));
  const header = element('header');
  header.append(element('span', labels.pause), element('time', parts.join(':')));
  panel.replaceChildren(texture, header,
    drawSection(labels.actors, actors.slice(0, compact ? 1 : 3), labels.noActors),
    drawSection(labels.music, tracks.slice(0, compact ? 1 : 2), labels.noMusic, '♪'));
  return panel.offsetHeight + 4;
};
