// Use Chromium's networking for API and filter downloads. Node's HTTP fetch
// parser (undici) asserted in Parser.finish after a TLS connection ended.
// Keep transport errors as rejected requests handled by IPC/UI callers.
function chromiumFetch(input, init) {
  return require('electron').net.fetch(input, init);
}
module.exports = { chromiumFetch };
