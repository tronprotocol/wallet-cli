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
  com_text = getBase58CheckAddress(com_addressBytes);
  // layer.alert("com_priKeyBytes:" + com_priKeyBytes);
  // layer.alert("com_text:" + com_text);
  // layer.alert("go_text:" + go_text);
  // layer.alert("num_text:" + num_text);
  var data = {
    "Address": com_text,
    "toAddress": go_text,
    "Amount": num_text
  }
  ajaxRequest("POST", trans, data, TransSuccessCallback, TransFailureCallback)
})

TransSuccessCallback = function (data) {
  //layer.alert("data:" + data);
  var transaction = getTransActionFromBase64String(data);
  var transactionSigned = signTransaction(com_priKeyBytes, transaction);
  var transactionBytes = transactionSigned.serializeBinary();
  var transactionString = byteArray2hexStr(transactionBytes);
  ajaxRequest("POST", anintran, transactionString, TransBroadSuccessCallback,
      TransBroadFailureCallback)
};
TransBroadSuccessCallback = function (success) {
  layer.alert($.i18n.prop('layer.transfersuccess'));
  console.log($.i18n.prop('layer.transfersuccess'))

};
TransFailureCallback = function (err) {
  layer.alert($.i18n.prop('layer.exchangefail'));

  console.log($.i18n.prop('layer.exchangefail'))
};
TransBroadFailureCallback = function (err) {
  layer.alert($.i18n.prop('layer.signfail'));

  console.log($.i18n.prop('layer.signfail'))
};
