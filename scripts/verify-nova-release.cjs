const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { version } = require('../package.json');

async function verify() {
  const exe = process.env.NOVA_TEST_EXE || process.env.KADR_TEST_EXE;
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-release-'));
  const out = path.join('test-results', 'nova-release-' + version + (exe ? '-packaged' : ''));
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(profile, 'library.json'), JSON.stringify({ theme:'dark', motion:true }));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const errors = [];
  const report = { version, packaged:Boolean(exe), passed:false, errors };
  const session = await _electron.launch({
    executablePath:exe || require('electron'), args:[...(exe ? [] : ['.']), '--test-profile=' + profile], env,
  });
  try {
    await session.evaluate(({app}) => { setTimeout(() => app.exit(0), 140000).unref() });
    const isMain = page => page.url().includes('/dist/index.html');
    const page = session.windows().find(isMain) || await session.waitForEvent('window', { predicate:isMain });
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.documentElement.dataset.startup === 'done');
    report.startup = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('mark')
      .filter(entry => entry.name.startsWith('nova:startup:')).map(entry => [entry.name.split(':').at(-1), Math.round(entry.startTime)])));
    assert.ok(report.startup.logo < report.startup.reveal && report.startup.reveal < report.startup.done);
    assert.equal(await page.locator('.intro-burst,.header-help,.settings-help').count(), 0);

    await page.locator('.header-profile').click();
    await page.getByRole('menuitem', {name:'Настройки',exact:true}).click();
    await page.getByRole('combobox', {name:'Язык интерфейса',exact:true}).click();
    await page.getByRole('option', {name:'English',exact:true}).click();
    await page.getByRole('heading', {name:'Settings',exact:true}).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(JSON.parse(await fs.readFile(path.join(profile,'language.json'),'utf8')), 'en');
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.locator('.hero-image').waitFor({timeout:45000});
    await page.locator('.recommendations .poster-button').first().waitFor({timeout:45000});
    await page.waitForFunction(() => document.querySelector('.recommendations')?.getAttribute('aria-busy') === 'false', null, {timeout:45000});
    await page.locator('.hero').hover();
    await page.waitForFunction(() => !!document.querySelector('.hero-image')?.naturalWidth);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(out,'overview-dark.png')});

    const launch = page.getByRole('button',{name:'Open search',exact:true});
    const input = page.getByRole('combobox',{name:'Search titles',exact:true});
    await launch.click();
    await input.fill('киберпанк');
    await page.locator('.docs-search-result').first().waitFor({timeout:20000});
    await page.waitForTimeout(390);
    report.search = await page.evaluate(() => {
      const panel = document.querySelector('.docs-search-panel').getBoundingClientRect();
      const footer = document.querySelector('.docs-search-all').getBoundingClientRect();
      return { width:Math.round(panel.width), height:Math.round(panel.height), bottomGap:Math.round(panel.bottom-footer.bottom) };
    });
    assert.equal(report.search.width, 640);
    assert.ok(report.search.bottomGap <= 12);
    await page.screenshot({path:path.join(out,'search-dark.png')});
    await page.keyboard.press('Escape');

    const poster = page.locator('.recommendations .poster-button').first();
    await poster.hover();
    const lens = poster.locator('.poster-liquid-action');
    assert.equal(await lens.evaluate(el => getComputedStyle(el).display), 'flex');
    await poster.locator('.poster-liquid-lens').waitFor({state:'attached'});
    await page.locator('.recommendations .poster-save').first().click();
    const toast = page.locator('.feedback-toast:popover-open');
    await toast.waitFor();
    await toast.getByText('Added to your collection',{exact:true}).waitFor();
    assert.ok(await toast.evaluate(el => el.classList.contains('lg-surface') && getComputedStyle(el).backdropFilter.includes('blur')));
    await toast.getByRole('button',{name:'Dismiss notification'}).click();
    await toast.waitFor({state:'detached'});

    await page.getByRole('button',{name:'Light theme',exact:true}).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.waitForTimeout(540);
    await page.locator('.header-profile').click();
    await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
    await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();
    await page.screenshot({path:path.join(out,'settings-light.png')});
    await page.getByRole('combobox',{name:'Interface language',exact:true}).click();
    await page.getByRole('option',{name:'Русский',exact:true}).click();
    await page.getByRole('heading',{name:'Настройки',exact:true}).waitFor();
    assert.equal(JSON.parse(await fs.readFile(path.join(profile,'language.json'),'utf8')), 'ru');
    assert.deepEqual(errors, []);
    report.passed = true;
  } catch (error) {
    report.failure = error.message;
    throw error;
  } finally {
    await session.close();
    report.testClosed = true;
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify(report));
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
