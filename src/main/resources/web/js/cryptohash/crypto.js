//return sign by 65 bytes r s id. id < 27
function doSign(priKeyBytes, base64Data) {
  var rowBytes = getRowBytesFromTransactionBase64(base64Data);
  var hashBytes = SHA256(rowBytes);
  var signBytes = ECKeySign(hashBytes, priKeyBytes);
  return signBytes;
}

//return bytes of rowdata, use to sign.
function getRowBytesFromTransactionBase64(base64Data) {
  var bytes = stringToBytes(base64Data);
  var bytesDecode = base64Decode(bytes);
  var transaction = proto.protocol.Transaction.deserializeBinary(bytesDecode);
  //toDO: assert ret is SUCESS
  var raw = transaction.getRawData();
  var rawBytes = raw.serializeBinary();
  return rawBytes;
}


//gen Ecc priKey for bytes
function genPriKey() {
  var EC = elliptic.ec;
  var ec = new EC('secp256k1');
  var key = ec.genKeyPair();
  var priKey = key.getPrivate();
  var priKeyHex  = priKey.toString('hex');
  while (priKeyHex.length < 64){
    priKeyHex = "00" + priKeyHex;
  }
  var priKeyBytes = hexStr2byteArray(priKeyHex);
  return priKeyBytes;
}

//return address by bytes, pubBytes is byte[]
function computeAddress(pubBytes) {
  var pubKey = bin2String(pubBytes);
  if (pubKey.length == 65) {
    pubKey = pubKey.substring(1);
  }
  var hash = CryptoJS.SHA3(pubKey).toString();
  var addressHex = hash.substring(24);
  var addressBytes = hexStr2byteArray(addressHex);
  return addressBytes;
}

//return address by bytes, priKeyBytes is byte[]
function getAddressFromPriKey(priKeyBytes) {
  var pubBytes = getPubKeyFromPriKey(priKeyBytes);
  var addressBytes = computeAddress(pubBytes);
  return addressBytes;
}

//return pubkey by 65 bytes, priKeyBytes is byte[]
function getPubKeyFromPriKey(priKeyBytes) {
  var EC = elliptic.ec;
  var ec = new EC('secp256k1');
  var key = ec.keyFromPrivate(priKeyBytes, 'bytes');
  var pubkey = key.getPublic();
  var x = pubkey.x;
  var y = pubkey.y;
  var xHex = x.toString('hex');
  while (xHex.length < 64) {
    xHex = "00" + xHex;
  }
  var yHex = y.toString('hex');
  while (yHex.length < 64) {
    yHex = "00" + yHex;
  }
  var pubkeyHex = "04" + xHex + yHex;
  var pubkeyBytes = hexStr2byteArray(pubkeyHex);
  return pubkeyBytes;
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
  while (rHex.length < 64) {
    rHex = "00" + rHex;
  }
  var sHex = s.toString('hex');
  while (sHex.length < 64) {
    sHex = "00" + sHex;
  }
  var idHex = byte2hexStr(id);
  var signHex = rHex + sHex + idHex;
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