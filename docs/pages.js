const english = {
  nav: 'Navigation', community: 'Community ratings',
  heading: 'Movies and TV in one place',
  intro: 'An open-source catalog for Windows.',
  download: 'Download for Windows',
  screenshot: 'NOVA home with a collection of movies and TV shows',
  sharing: 'You can share and withdraw your ratings in NOVA Settings.',
  waiting: 'Checking the ratings configuration…',
  configured: 'Ratings server address published',
  unconfigured: 'Ratings server pending',
  unavailable: 'Could not check the ratings configuration',
  releases: 'All releases', issues: 'Report an issue', support: 'Support NOVA',
};

const russianStatus = {
  configured: 'Адрес сервера опубликован',
  unconfigured: 'Сервер рейтинга ещё не подключён',
  unavailable: 'Не удалось проверить статус рейтинга',
};

const language = new URL(location.href).searchParams.get('lang');
const inEnglish = language === 'en' || (language !== 'ru' && /^en\b/i.test(navigator.language));
if (inEnglish) {
  document.documentElement.lang = 'en';
  document.title = 'NOVA — movies and TV';
  for (const element of document.querySelectorAll('[data-copy]')) {
    const label = english[element.dataset.copy];
    if (element.matches('img')) element.alt = label;
    else if (element.hasAttribute('aria-label')) element.setAttribute('aria-label', label);
    else element.textContent = label;
  }
  const switcher = document.querySelector('#language');
  switcher.href = '?lang=ru';
  switcher.lang = switcher.hreflang = 'ru';
  switcher.textContent = 'Русский';
}

const status = document.querySelector('#community-status');
function report(value) {
  status.textContent = (inEnglish ? english : russianStatus)[value];
}

fetch('https://raw.githubusercontent.com/DeLorean-bot/NOVA/main/community/endpoint.json', {
  credentials: 'omit', signal: AbortSignal.timeout(6000),
}).then(async response => {
  if (!response.ok) throw new Error('Ratings configuration unavailable');
  const { origin } = await response.json();
  report(origin?.startsWith('https://') ? 'configured' : 'unconfigured');
}).catch(() => report('unavailable'));
