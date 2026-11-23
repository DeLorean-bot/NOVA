// Use Chromium's networking for API and filter downloads. Node's HTTP fetch
// parser (undici) asserted in Parser.finish after a TLS connection ended.
// Keep transport errors as rejected requests handled by IPC/UI callers.
function chromiumFetch(input, init) {
  return require('electron').net.fetch(input, init);
}

function isConnectionError(error) {
  const description = typeof error === 'string' ? error : `${error?.code || ''} ${error?.message || ''}`;
  return error?.name === 'TimeoutError' || /\b(?:ERR_(?:INTERNET_DISCONNECTED|NETWORK_CHANGED|NETWORK_IO_SUSPENDED|ADDRESS_UNREACHABLE|NAME_NOT_RESOLVED|CONNECTION_(?:RESET|CLOSED|REFUSED|ABORTED|TIMED_OUT|FAILED)|TIMED_OUT)|ECONNRESET|ECONNREFUSED|ENET(?:DOWN|UNREACH)|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND|ETIMEDOUT)\b/i.test(description);
}
module.exports = { chromiumFetch, isConnectionError };
