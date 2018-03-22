function bin2String(array) {
  return String.fromCharCode.apply(String, array);
}
//比较两个byteArray是否相等
function arrayEquals(array1, array2) {
  if (array1.length != array2.length){
    return false;
  }
  var i;
  for(i = 0; i < array1.length; i++){
    if (array1[i] != array2[i]){
      return false;
    }
  }
  return true;
}
//从base64字符串中解析TransAction对象
function getTransActionFromBase64String(base64String) {
  var base64Bytes = stringToBytes(base64String);
  var bytesDecode = base64Decode(base64Bytes);
  var transaction = proto.protocol.Transaction.deserializeBinary(bytesDecode);
  //ToDo : ret is success
  return transaction;
}

//Return a list contains contract object
//从TransAction对象中获得合约列表
function getContractListFromTransaction(transaction) {
  var raw = transaction.getRawData();
  var type = raw.getType();
  if (type != 1) {
    alert("Invalid transaction type !!!!" + type);
    return null;
  }
  var contractList = raw.getContractList();
  var count = contractList.length;
  if (count == 0) {
    alert("No contract !!!!");
    return null;
  }

  array = new Array(count);
  var unpack = proto.google.protobuf.Any.prototype.unpack;
  while (count > 0) {
    count--;
    var oneContract = contractList[count];
    var any = oneContract.getParameter();
    var contarcType = oneContract.getType();
    var obje;
    switch (contarcType) {
      case proto.protocol.Transaction.Contract.ContractType.ACCOUNTCREATECONTRACT:
        obje = any.unpack(
            proto.protocol.AccountCreateContract.deserializeBinary,
            "protocol.AccountCreateContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.TRANSFERCONTRACT:
        obje = any.unpack(
            proto.protocol.TransferContract.deserializeBinary,
            "protocol.TransferContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.TRANSFERASSETCONTRACT:
        obje = any.unpack(
            proto.protocol.TransferAsstContract.deserializeBinary,
            "protocol.TransferAssetContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.VOTEASSETCONTRACT:
        obje = any.unpack(
            proto.protocol.VoteAssetContract.deserializeBinary,
            "protocol.VoteAssetContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.VOTEWITNESSCONTRACT:
        obje = any.unpack(
            proto.protocol.VoteWitnessContract.deserializeBinary,
            "protocol.VoteWitnessContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.WITNESSCREATECONTRACT:
        obje = any.unpack(
            proto.protocol.WitnessCreateContract.deserializeBinary,
            "protocol.WitnessCreateContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.ASSETISSUECONTRACT:
        obje = any.unpack(
            proto.protocol.AssetIssueContract.deserializeBinary,
            "protocol.AssetIssueContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.DEPLOYCONTRACT:
        obje = any.unpack(
            proto.protocol.DeployContract.deserializeBinary,
            "protocol.DeployContract");
        break;

      case proto.protocol.Transaction.Contract.ContractType.WITNESSUPDATECONTRACT:
        obje = any.unpack(
            proto.protocol.WitnessUpdateContract.deserializeBinary,
            "protocol.WitnessUpdateContract");
        break;
    }
    array[count] = obje;
  }
  return array;
}
//字符串转byteArray数据格式
function stringToBytes(str) {
  var bytes = new Array();
  var len, c;
  len = str.length;
  for (var i = 0; i < len; i++) {
    c = str.charCodeAt(i);
    if (c >= 0x010000 && c <= 0x10FFFF) {
      bytes.push(((c >> 18) & 0x07) | 0xF0);
      bytes.push(((c >> 12) & 0x3F) | 0x80);
      bytes.push(((c >> 6) & 0x3F) | 0x80);
      bytes.push((c & 0x3F) | 0x80);
    } else if (c >= 0x000800 && c <= 0x00FFFF) {
      bytes.push(((c >> 12) & 0x0F) | 0xE0);
      bytes.push(((c >> 6) & 0x3F) | 0x80);
      bytes.push((c & 0x3F) | 0x80);
    } else if (c >= 0x000080 && c <= 0x0007FF) {
      bytes.push(((c >> 6) & 0x1F) | 0xC0);
      bytes.push((c & 0x3F) | 0x80);
    } else {
      bytes.push(c & 0xFF);
    }
  }
  return bytes;

}
//byteArray数据格式转字符串
function bytesToString(arr) {
  if (typeof arr === 'string') {
    return arr;
  }
  var str = '',
      _arr = arr;
  for (var i = 0; i < _arr.length; i++) {
    var one = _arr[i].toString(2),
        v = one.match(/^1+?(?=0)/);
    if (v && one.length == 8) {
      var bytesLength = v[0].length;
      var store = _arr[i].toString(2).slice(7 - bytesLength);
      for (var st = 1; st < bytesLength; st++) {
        store += _arr[st + i].toString(2).slice(2);
      }
      str += String.fromCharCode(parseInt(store, 2));
      i += bytesLength - 1;
    } else {
      str += String.fromCharCode(_arr[i]);
    }
  }
  return str;
}

function hextoString(hex) {
  var arr = hex.split("")
  var out = ""
  for (var i = 0; i < arr.length / 2; i++) {
    var tmp = "0x" + arr[i * 2] + arr[i * 2 + 1]
    var charValue = String.fromCharCode(tmp);
    out += charValue
  }
  return out
}

/* Convert a hex char to value */
function hexChar2byte(c) {
  var d = 0;
  if (c >= 'A' && c <= 'F') {
    d = c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
  }
  else if (c >= 'a' && c <= 'f') {
    d = c.charCodeAt(0) - 'a'.charCodeAt(0) + 10;
  }
  else if (c >= '0' && c <= '9') {
    d = c.charCodeAt(0) - '0'.charCodeAt(0);
  }
  return d;
}

/* Check if a char is hex char */
function isHexChar(c) {
  if ((c >= 'A' && c <= 'F') ||
      (c >= 'a' && c <= 'f') ||
      (c >= '0' && c <= '9')) {
    return 1;
  }
  return 0;
}

/* Convert HEX string to byte array */
//16进制的ASCII字符串转为byteArray格式。
function hexStr2byteArray(str) {
  var byteArray = Array();
  var d = 0;
  var i = 0;
  var j = 0;
  var k = 0;

  for (i = 0; i < str.length; i++) {
    var c = str.charAt(i);
    if (isHexChar(c)) {
      d <<= 4;
      d += hexChar2byte(c);
      j++;
      if (0 == (j % 2)) {
        byteArray[k++] = d;
        d = 0;
      }
    }
  }
  return byteArray;
}

/* Convert a byte to string */
function byte2hexStr(byte) {
  var hexByteMap = "0123456789ABCDEF";
  var str = "";
  str += hexByteMap.charAt(byte >> 4);
  str += hexByteMap.charAt(byte & 0x0f);
  return str;
}

/* Convert byte arry to HEX string */
//byteArray格式数据转为16进制的ASCII字符串。
function byteArray2hexStr(byteArray) {
  var str = "";
  for (var i = 0; i < (byteArray.length - 1); i++) {
    str += byte2hexStr(byteArray[i]);
  }
  str += byte2hexStr(byteArray[i]);
  return str;
}

function base64Decode(bytes64) {
  var string64 = bytesToString(bytes64);
  var b = new Base64();
  var decodeBytes = b.decodeToByteArray(string64);
//  var decodeBytes = stringToBytes(decodeString);
  return decodeBytes;
}
//从base64字符串中解码出原文，格式为byteArray格式
function base64DecodeFromString(string64) {
  var b = new Base64();
  var decodeBytes = b.decodeToByteArray(string64);
//  var decodeBytes = stringToBytes(decodeString);
  return decodeBytes;
}

//return baset64 String
//将byteArray格式数据编码为base64字符串
function base64EncodeToString(bytes){
  // var string = bytesToString(bytes);
  var b = new Base64();
  var string64 = b.encodeIgnoreUtf8(bytes);
  return string64
}

//return baset64 bytes
function base64Encode(bytes) {
  // var string = bytesToString(bytes);
  var b = new Base64();
  var string64 = b.encodeIgnoreUtf8(bytes);
  var bytes64 = stringToBytes(string64);
  return bytes64;
}

function Base64() {

  // private property
  _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

  // public method for encoding
  this.encode = function (input) {
    var output = "";
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;
//    input = _utf8_encode(input);
    while (i < input.length) {
      chr1 = input.charCodeAt(i++);
      chr2 = input.charCodeAt(i++);
      chr3 = input.charCodeAt(i++);
      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;
      if (isNaN(chr2)) {
        enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
        enc4 = 64;
      }
      output = output +
          _keyStr.charAt(enc1) + _keyStr.charAt(enc2) +
          _keyStr.charAt(enc3) + _keyStr.charAt(enc4);
    }
    return output;
  }

  // public method for encoding
  this.encodeIgnoreUtf8 = function (inputBytes) {
    var output = "";
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;
//    input = _utf8_encode(input);
    while (i < inputBytes.length) {
      chr1 = inputBytes[i++];
      chr2 = inputBytes[i++];
      chr3 = inputBytes[i++];
      enc1 = chr1 >> 2;
      enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
      enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
      enc4 = chr3 & 63;
      if (isNaN(chr2)) {
        enc3 = enc4 = 64;
      } else if (isNaN(chr3)) {
        enc4 = 64;
      }
      output = output +
          _keyStr.charAt(enc1) + _keyStr.charAt(enc2) +
          _keyStr.charAt(enc3) + _keyStr.charAt(enc4);
    }
    return output;
  }

  // public method for decoding
  this.decode = function (input) {
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    while (i < input.length) {
      enc1 = _keyStr.indexOf(input.charAt(i++));
      enc2 = _keyStr.indexOf(input.charAt(i++));
      enc3 = _keyStr.indexOf(input.charAt(i++));
      enc4 = _keyStr.indexOf(input.charAt(i++));
      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;
      output = output + String.fromCharCode(chr1);
      if (enc3 != 64) {
        output = output + String.fromCharCode(chr2);
      }
      if (enc4 != 64) {
        output = output + String.fromCharCode(chr3);
      }
    }
    output = _utf8_decode(output);
    return output;
  }

  // public method for decoding
  this.decodeToByteArray = function (input) {
    var output = "";
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    while (i < input.length) {
      enc1 = _keyStr.indexOf(input.charAt(i++));
      enc2 = _keyStr.indexOf(input.charAt(i++));
      enc3 = _keyStr.indexOf(input.charAt(i++));
      enc4 = _keyStr.indexOf(input.charAt(i++));
      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;
      output = output + String.fromCharCode(chr1);
      if (enc3 != 64) {
        output = output + String.fromCharCode(chr2);
      }
      if (enc4 != 64) {
        output = output + String.fromCharCode(chr3);
      }
    }
    var outBytes = _out2ByteArray(output);
    return outBytes;
  }

  // private method for UTF-8 decoding
  _out2ByteArray = function (utftext) {
    var byteArray = new Array(utftext.length)
    var i = 0;
    var c = c1 = c2 = 0;
    while (i < utftext.length) {
      c = utftext.charCodeAt(i);
      byteArray[i] = c;
      i++;
    }
    return byteArray;
  }

  // private method for UTF-8 encoding
  _utf8_encode = function (string) {
    string = string.replace(/\r\n/g, "\n");
    var utftext = "";
    for (var n = 0; n < string.length; n++) {
      var c = string.charCodeAt(n);
      if (c < 128) {
        utftext += String.fromCharCode(c);
      } else if ((c > 127) && (c < 2048)) {
        utftext += String.fromCharCode((c >> 6) | 192);
        utftext += String.fromCharCode((c & 63) | 128);
      } else {
        utftext += String.fromCharCode((c >> 12) | 224);
        utftext += String.fromCharCode(((c >> 6) & 63) | 128);
        utftext += String.fromCharCode((c & 63) | 128);
      }

    }
    return utftext;
  }

  // private method for UTF-8 decoding
  _utf8_decode = function (utftext) {
    var string = "";
    var i = 0;
    var c = c1 = c2 = 0;
    while (i < utftext.length) {
      c = utftext.charCodeAt(i);
      if (c < 128) {
        string += String.fromCharCode(c);
        i++;
      } else if ((c > 191) && (c < 224)) {
        c2 = utftext.charCodeAt(i + 1);
        string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
        i += 2;
      } else {
        c2 = utftext.charCodeAt(i + 1);
        c3 = utftext.charCodeAt(i + 2);
        string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3
            & 63));
        i += 3;
      }
    }
    return string;
  }
}

//yyyy-MM-DD HH-mm-ss
function strToDate(str) {
  var tempStrs = str.split(" ");
  var dateStrs = tempStrs[0].split("-");
  var year = parseInt(dateStrs[0], 10);
  var month = parseInt(dateStrs[1], 10) - 1;
  var day = parseInt(dateStrs[2], 10);
  if ( tempStrs.length > 1 ) {
    var timeStrs = tempStrs[1].split("-");
    var hour = parseInt(timeStrs [0], 10);
    var minute = parseInt(timeStrs[1], 10) - 1;
    var second = parseInt(timeStrs[2], 10);
    return new Date(year, month, day, hour, minute, second);
  }

  return new Date(year, month, day);
}