/*
* 转账
*
*
*
* */

$('#com_adress').on('blur', function () {
  console.log(12313123123)
  if ($('#com_adress').val()) {
    console.log(454545)
    com_priKeyBytes = base64DecodeFromString($('#com_adress').val());
    com_addressBytes = getAddressFromPriKey(com_priKeyBytes);
    com_text = byteArray2hexStr(com_addressBytes);
    ajaxRequest("POST", getAccountInfo, {'address': com_text},
        GetAccountSuccessCallback,
        GetAccountFailureCallback)
  } else {
    $('.com_warn').css('display', 'block');
  }
});

GetAccountSuccessCallback = function (account) {
  console.log("account" + account)

  var AccountData = proto.protocol.Account.deserializeBinary(account);
  var AssetMap = AccountData.getAssetMap().toArray();

  str = ''
  console.log("balance:" + AccountData.getBalance());
  if (AccountData.getBalance() > 0) {
    str += '<option value="TRX">TRX</option>'
  }

  console.log(AssetMap)

  for (var key in AssetMap) {

    console.log(" key： " + key[0]);
    console.log(" key： " + key[0][0]);
    str += '<option value="' + key[0][0] + '">' + key[0][0]
        + '</option>'
  }
  $('#coinSelect').append(str)
}

GetAccountFailureCallback = function () {
  console.log(111)
}
$('#com_adress').on('input propertychange', function () {
  console.log($(this).val())
  if ($(this).val() != '') {
    $('.com_warn').css('display', 'none');
    return;
  }
});
$('#go_cont').on('input propertychange', function () {

  console.log(typeof($('#go_cont').val()))
  if ($(this).val() != '') {
    $('.go_warn').css('display', 'none');
    return;
  }
});
$('#num').on('input propertychange', function () {
  if ($(this).val() != '') {
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

  var data = {
    "assetName": com_asset,
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
