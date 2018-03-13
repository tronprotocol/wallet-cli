
//return address by HexString, pubBytes is byte[]
function computeAddress (pubBytes) {
  var pubKey = bin2String(pubBytes);
  if (pubKey.length == 65){
    pubKey = pubKey.substring(1);
  }
  var hash = CryptoJS.SHA3(pubKey).toString();
  return hash.substring(24);
}

//return sign by 65 bytes
function ECKeySign(hashBytes, priKeyBytes) {
  var EC = elliptic.ec;
  var ec = new EC('secp256k1');
  var key = ec.keyFromPrivate(priKeyBytes, 'hex');
  var signature = key.sign(hashBytes);
  return signature;
}

//toDO:
//return 32 bytes
function SHA256(msgBytes) {
  return  hexStr2byteArray("3031323334353630313233343536373839");
}