/**
 * Sign A Transaction by priKey.
 * signature is 65 bytes, r[32] || s[32] || id[1](<27)
 * @returns  a Transaction object signed
 * @param priKeyBytes: privateKey for ECC
 * @param transaction: a Transaction object unSigned
 */
function signTransaction(priKeyBytes, transaction) {
  var raw = transaction.getRawData();
  var rawBytes = raw.serializeBinary();
  var hashBytes = SHA256(rawBytes);
  var signBytes = ECKeySign(hashBytes, priKeyBytes);
  var uint8Array = new Uint8Array(signBytes);
  var count = raw.getContractList().length;
  for (i = 0; i < count; i++) {
    transaction.addSignature(uint8Array); //TODO: multy priKey
  }
  return transaction;
}

//return bytes of rowdata, use to sign.
function getRowBytesFromTransactionBase64(base64Data) {
  var bytesDecode = base64DecodeFromString(base64Data);
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
  var priKeyHex = priKey.toString('hex');
  while (priKeyHex.length < 64) {
    priKeyHex = "0" + priKeyHex;
  }
  var priKeyBytes = hexStr2byteArray(priKeyHex);
  return priKeyBytes;
}

//return address by bytes, pubBytes is byte[]
//return address by bytes, pubBytes is byte[]
//TODO: There have a bug。Hundreds of computing addresses, possibly with once error.
//For example,
//pubBytes = 0405BE4D534BC638CF97BC41E47B62789454F96C232D21B5DE5DE4ACA127E8C169A62487D42546414C0B7CB6A3CD6129C5CAAD157EB0652867994DFAA203AA11B4
//Compute the result of the address will be:28E0309DA5FCF9CE4C2BC5FA75EC7388597112A8
//but Compute the function public static byte[] computeAddress(byte[] pubBytes) of ECKey.java will get f1fb4f6095c057bfa2bb6933e1ad6b9609fba865
//Maybe CryptoJS.SHA3 was a little wrong.
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
//return address by String, priKeyBytes is base64String
function getHexStrAddressFromPriKeyBase64String(priKeyBase64String) {
    var priKeyBytes = base64DecodeFromString(priKeyBase64String);
    var pubBytes = getPubKeyFromPriKey(priKeyBytes);
    var addressBytes = computeAddress(pubBytes);
    var addressHex = byteArray2hexStr(addressBytes);
    return addressHex;
}
//return address by String, priKeyBytes is base64String
function getAddressFromPriKeyBase64String(priKeyBase64String) {
  var priKeyBytes = base64DecodeFromString(priKeyBase64String);
  var pubBytes = getPubKeyFromPriKey(priKeyBytes);
  var addressBytes = computeAddress(pubBytes);
  var addressBase64 = base64EncodeToString(addressBytes);
  return addressBase64;
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
    xHex = "0" + xHex;
  }
  var yHex = y.toString('hex');
  while (yHex.length < 64) {
    yHex = "0" + yHex;
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
    rHex = "0" + rHex;
  }
  var sHex = s.toString('hex');
  while (sHex.length < 64) {
    sHex = "0" + sHex;
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