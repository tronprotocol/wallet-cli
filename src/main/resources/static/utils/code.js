function bin2String(array) {
  return String.fromCharCode.apply(String, array);
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
function hexChar2byte(c)
{
  var d = 0;
  if (c>='A' && c<='F')
  {
    d = c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
  }
  else if (c>='a' && c<='f')
  {
    d = c.charCodeAt(0) - 'a'.charCodeAt(0) + 10;
  }
  else if (c>='0' && c<='9')
  {
    d = c.charCodeAt(0) - '0'.charCodeAt(0);
  }
  return d;
}


/* Check if a char is hex char */
function isHexChar(c)
{
  if ((c>='A' && c<='F') ||
      (c>='a' && c<='f') ||
      (c>='0' && c<='9'))
  {
    return 1;
  }
  return 0;
}


/* Convert HEX string to byte array */
function hexStr2byteArray(str)
{
  var byteArray = Array();
  var d = 0;
  var i = 0;
  var j = 0;
  var k = 0;


  for (i=0; i<str.length; i++)
  {
    var c = str.charAt(i);
    if (isHexChar(c))
    {
      d <<= 4;
      d += hexChar2byte(c);
      j++;
      if (0==(j%2))
      {
        byteArray[k++] = d;
        d = 0;
      }
    }
  }
  return byteArray;
}


/* Convert a byte to string */
function byte2hexStr(byte)
{
  var hexByteMap = "0123456789ABCDEF";
  var str = "";
  str += hexByteMap.charAt(byte >> 4);
  str += hexByteMap.charAt(byte & 0x0f);
  return str;
}


/* Convert byte arry to HEX string */
function byteArray2hexStr(byteArray)
{
  var str = "";
  for (var i=0; i<(byteArray.length-1); i++)
  {
    str += byte2hexStr(byteArray[i]);
  }
  str += byte2hexStr(byteArray[i]);
  return str;
}