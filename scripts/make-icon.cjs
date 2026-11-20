// Prepare app and Windows icon resources from the supplied NOVA mark.
const fs = require('node:fs/promises');
const path = require('node:path');

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'), [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', windowsHide: true });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  app.whenReady().then(async () => {
    const root = path.resolve(__dirname, '..');
    const markPath = path.join(root, 'src/assets/nova-mark.png');
    const reference = process.argv[2];
    let window;
    try {
      const source = (await fs.readFile(reference || markPath)).toString('base64');
      window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
      await window.loadURL('data:text/html,<html><body></body></html>');
      const assets = await window.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = 'data:image/png;base64,${source}';
        await image.decode();
        const canvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });
        const encode = canvas => canvas.toDataURL('image/png').split(',')[1];
        let mark = canvas(image.width, image.height);
        if (${Boolean(reference)}) {
          // The left third of the supplied light reference contains the isolated symbol.
          const scan = canvas(Math.round(image.width * .33), image.height);
          const context = scan.getContext('2d');
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, scan.width, scan.height);
          let left = scan.width, top = scan.height, right = -1, bottom = -1;
          for (let y = 0; y < scan.height; y++) {
            for (let x = 0; x < scan.width; x++) {
              const index = (y * scan.width + x) * 4;
              const light = Math.min(...pixels.data.subarray(index, index + 3));
              const opacity = Math.max(0, Math.min(255, (237 - light) * 255 / 207));
              pixels.data.set([255, 255, 255, Math.round(opacity)], index);
              if (opacity > 20) {
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
              }
            }
          }
          if (right < left || bottom < top) throw new Error('Symbol absent from the input image');
          context.putImageData(pixels, 0, 0);
          mark = canvas(right - left + 5, bottom - top + 5);
          mark.getContext('2d').drawImage(scan, left - 2, top - 2, mark.width, mark.height, 0, 0, mark.width, mark.height);
        } else {
          mark.getContext('2d').drawImage(image, 0, 0);
        }
        const make = (ink, tile) => [16, 24, 32, 48, 64, 128, 256].map(size => {
          const output = canvas(size, size);
          const context = output.getContext('2d');
          context.imageSmoothingQuality = 'high';
          const width = size * (tile ? .79 : .89);
          const height = width * mark.height / mark.width;
          context.drawImage(mark, (size - width) / 2, (size - height) / 2, width, height);
          context.globalCompositeOperation = 'source-in';
          context.fillStyle = ink;
          context.fillRect(0, 0, size, size);
          if (tile) {
            context.globalCompositeOperation = 'destination-over';
            context.fillStyle = tile;
            context.beginPath();
            context.roundRect(1, 1, size - 2, size - 2, size * .22);
            context.fill();
          }
          return { size, data: encode(output) };
        });
        return { mark: encode(mark), icons: make('#fff', '#101318'), light: make('#000'), dark: make('#fff') };
      })()`);
      if (reference) await fs.writeFile(markPath, Buffer.from(assets.mark, 'base64'));
      await fs.writeFile(path.join(root, 'build/icon.ico'), makeIco(assets.icons));
      for (const [file, frames] of [['icon', assets.icons], ['icon-light', assets.light], ['icon-dark', assets.dark]]) {
        await fs.writeFile(path.join(root, 'build', file + '.png'), Buffer.from(frames.at(-1).data, 'base64'));
      }
      console.log('NOVA: seven Windows icon sizes, plus light and dark window icons.');
      window.destroy();
      app.exit(0);
    } catch (error) {
      console.error(error);
      window?.destroy();
      app.exit(1);
    }
  });
}

function makeIco(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  const pngs = frames.map(({ size, data }, index) => {
    const png = Buffer.from(data, 'base64');
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
    return png;
  });
  return Buffer.concat([header, ...pngs]);
}
