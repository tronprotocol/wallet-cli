var add_pre_fix = 'a0';   //a0 + address  ,a0 is version
var add_pre_fix_byte = 0xa0;   //a0 + address  ,a0 is version

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
function computeAddress(pubBytes) {
  if (pubBytes.length == 65) {
    pubBytes = pubBytes.slice(1);
  }
  var hash = CryptoJS.SHA3(pubBytes).toString();
  var addressHex = hash.substring(24);
  addressHex = add_pre_fix + addressHex;
  var addressBytes = hexStr2byteArray(addressHex);
  return addressBytes;
}

//return address by bytes, priKeyBytes is byte[]
function getAddressFromPriKey(priKeyBytes) {
  var pubBytes = getPubKeyFromPriKey(priKeyBytes);
  var addressBytes = computeAddress(pubBytes);
  return addressBytes;
}

//return address by Base58Check String,
function getBase58CheckAddress(addressBytes) {
  var hash0 = SHA256(addressBytes);
  var hash1 = SHA256(hash0);
  var checkSum = hash1.slice(0, 4);
  checkSum = addressBytes.concat(checkSum);
  var base58Check = encode58(checkSum);

  return base58Check;
}

function validAddress(base58Sting) {
  if (typeof(base58Sting) != 'string') {
    return false;
  }
  if (base58Sting.length != 35) {
    return false;
  }
  var address = decode58(base58Sting);
  if (address.length != 25) {
    return false;
  }
  if (address[0] != add_pre_fix_byte) {
    return false;
  }
  var checkSum = address.slice(21);
  address = address.slice(0, 21);
  var hash0 = SHA256(address);
  var hash1 = SHA256(hash0);
  var checkSum1 = hash1.slice(0, 4);
  if (checkSum[0] == checkSum1[0] && checkSum[1] == checkSum1[1] && checkSum[2]
      == checkSum1[2] && checkSum[3] == checkSum1[3]
  ) {
    return true
  }
  return false;
}

//return address by Base58Check String, priKeyBytes is base64String
function getBase58CheckAddressFromPriKeyBase64String(priKeyBase64String) {
  var priKeyBytes = base64DecodeFromString(priKeyBase64String);
  var pubBytes = getPubKeyFromPriKey(priKeyBytes);
  var addressBytes = computeAddress(pubBytes);
  return getBase58CheckAddress(addressBytes);
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