
function computeAddress (pubBytes) {
  var pubKey = bin2String(pubBytes);
  if (pubKey.length == 65){
    pubKey = pubKey.substring(1);
  }
  var hash = CryptoJS.SHA3(pubKey).toString();
  return hash.substring(24);
}