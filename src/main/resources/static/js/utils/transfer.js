/*
* 转账
*
*
*
* */

$('#com_adress').on('input propertychange', function () {

  if (this != '') {
    $('.com_warn').css('display', 'none');
    return;
  }
});
$('#go_cont').on('input propertychange', function () {

  console.log(typeof($('#go_cont').val()))
  if (this != '') {
    $('.go_warn').css('display', 'none');
    return;
  }
});
$('#num').on('input propertychange', function () {
  if (this != '') {
    $('.num_warn').css('display', 'none');
    return;
  }
});
$('#change').off('click').on('click', function () {
  event.stopPropagation();
  if (com_prik == '') {
    $('.com_warn').css('display', 'block');
    return;
  }
  if (go_text == '') {
    $('.go_warn').css('display', 'block');
    return;
  }
  if (num_text == '') {
    $('.num_warn').css('display', 'block');
    return;
  }
  ;
  var com_prik = $('#com_adress').val();
  var go_text = $('#go_cont').val();
  var num_text = $('#num').val();

  com_priKeyBytes = base64DecodeFromString(com_prik);
  com_addressBytes = getAddressFromPriKey(com_priKeyBytes);
  com_text = byteArray2hexStr(com_addressBytes);
  // alert("com_priKeyBytes:" + com_priKeyBytes);
  // alert("com_text:" + com_text);
  // alert("go_text:" + go_text);
  // alert("num_text:" + num_text);
  var data = {
    "Address": com_text,
    "toAddress": go_text,
    "Amount": num_text
  }
  ajaxRequest("POST", trans, data, TransSuccessCallback, TransFailureCallback)
})

TransSuccessCallback = function (data) {
  //alert("data:" + data);
  var transaction = getTransActionFromBase64String(data);
  var transactionSigned = signTransaction(com_priKeyBytes, transaction);
  var transactionBytes = transactionSigned.serializeBinary();
  var transactionString = byteArray2hexStr(transactionBytes);
  ajaxRequest("POST", anintran, transactionString, TransBroadSuccessCallback,
      TransBroadFailureCallback)
};
TransBroadSuccessCallback = function (success) {
  alert("转账成功");
  console.log('转账成功')

};
TransFailureCallback = function (err) {
  alert("转账失败，生成交易失败");

  console.log('转账失败，生成交易失败')
};
TransBroadFailureCallback = function (err) {
  alert("转账失败，签名失败");

  console.log('转账失败，签名失败')
};
