export function withDeviceSession(expression) {
  const legacyRead = "localStorage.getItem('lc_play_device_token')";
  if (!expression.includes(legacyRead)) return expression;
  return `(async function () {
    var __lcDiagnosticToken = localStorage.getItem('lc_play_device_token');
    var encrypted = localStorage.getItem('lc_play_device_session_v1');
    if (!__lcDiagnosticToken && encrypted) {
      var database = await new Promise(function (resolve, reject) {
        var request = indexedDB.open('lc_play_private_storage', 1);
        request.onsuccess = function () { resolve(request.result); }; request.onerror = reject;
      });
      try {
        var key = await new Promise(function (resolve, reject) { var request = database.transaction('keys').objectStore('keys').get('device-session-v1'); request.onsuccess = function () { resolve(request.result); }; request.onerror = reject; });
        var value = JSON.parse(encrypted);
        var decode = function (text) { return Uint8Array.from(atob(text), function (character) { return character.charCodeAt(0); }); };
        var clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(value.iv), additionalData: new TextEncoder().encode('com.lcplay.tv/device-session/v1') }, key, decode(value.data));
        __lcDiagnosticToken = new TextDecoder().decode(clear);
      } finally { database.close(); }
    }
    return eval(${JSON.stringify(expression.split(legacyRead).join('__lcDiagnosticToken'))});
  })()`;
}
