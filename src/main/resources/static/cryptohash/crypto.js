
//return address by HexString, pubBytes is byte[]
function computeAddress (pubBytes) {
  var pubKey = bin2String(pubBytes);
  if (pubKey.length == 65){
    pubKey = pubKey.substring(1);
  }
  var hash = CryptoJS.SHA3(pubKey).toString();
  return hash.substring(24);
}

//return sign by 65 bytes r s id. id < 27
function ECKeySign(hashBytes, priKeyBytes) {
  var EC = elliptic.ec;
  var ec = new EC('secp256k1');
  var key = ec.keyFromPrivate(priKeyBytes, 'bytes');
  var signature = key.sign(hashBytes);
  var r = signature.r;
  var s = signature.s;
  var id = signature.recoveryParam;
  var rHex = r.toString('hex');
  while (rHex.length < 64 ){
    rHex = "00" + rHex;
  }
  var sHex = s.toString('hex');
  while (sHex.length < 64 ){
    sHex = "00" + sHex;
  }
  var idHex = byte2hexStr(id);
  var signHex = rHex+sHex+idHex;
  var signBytes = hexStr2byteArray(signHex);
  return signBytes;
}

//toDO:
//return 32 bytes
function SHA256(msgBytes) {
  var shaObj = new jsSHA("SHA-256", "HEX");
  var msgHex = byteArray2hexStr(msgBytes);
  shaObj.update(msgHex);
  var hashHex = shaObj.getHash("HEX");
  var hashBytes = hexStr2byteArray(hashHex);
  return hashBytes;
}