const panel = document.querySelector('main');
const texture = document.createElement('div');
texture.className = 'texture';
const backdrop = document.createElement('img');
backdrop.alt = '';
texture.append(backdrop);

window.setWarningBackdrop = ({ image, x, y, width, height }) => {
  Object.assign(backdrop.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
  backdrop.src = image;
};

window.renderPlaybackWarning = ({ language, theme, motion, age, warnings, label }) => {
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.motion = motion ? 'on' : 'off';
  backdrop.removeAttribute('src');
  panel.removeAttribute('data-visible');
  panel.replaceChildren(texture);
  if (age) {
    const badge = document.createElement('strong');
    badge.className = 'age';
    badge.textContent = age + '+';
    panel.append(badge);
  }

  const copy = document.createElement('div');
  copy.className = 'warnings';
  for (const warning of warnings.length ? warnings : [label]) {
    const line = document.createElement('span');
    line.textContent = warning;
    copy.append(line);
  }
  panel.append(copy);
  const height = panel.offsetHeight;
  panel.setAttribute('data-visible', '');
  return height + 4;
};
