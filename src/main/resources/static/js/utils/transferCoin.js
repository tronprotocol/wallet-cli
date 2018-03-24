/*
* 转账
*
*
*
* */

//select
$('#com_adress').on('blur', function () {
  if($('#com_adress').val()) {
    com_priKeyBytes = base64DecodeFromString($('#com_adress').val());
    com_addressBytes = getAddressFromPriKey(com_priKeyBytes);
    com_text = byteArray2hexStr(com_addressBytes);
    //查询用户账户资产
    ajaxRequest("POST", getAccountInfo, {'address': com_text}, GetAccountSuccessCallback, GetAccountFailureCallback)
  } else {
    $('.com_warn').css('display', 'block');
  }
});

//查询用户账户资产 数据处理
GetAccountSuccessCallback = function (account) {
    //从base64字符串中解码出原文，格式为byteArray格式
    var bytesAccountInfo = base64DecodeFromString(account);
    //调用方法deserializeBinary解析
    var accountInfo = proto.protocol.Account.deserializeBinary(bytesAccountInfo);
    var Map = accountInfo.getAssetMap().toArray();
    var Balance = accountInfo.getBalance();
    var str = ''
    if (Balance > 0) {
      str = '<option value="">请选择币种</option>'
            +'<option value="TRX">TRX</option>'
    }else{
        str = '<option value="">请选择币种</option>'
    }
    for (var key in Map) {
        name = Map[key][0];
        //nameBalance = Map[key][1];
        str += '<option value="'+name+'">'+ name +'</option>'
    }
    $('#coinSelect').append(str)
}

GetAccountFailureCallback = function () {
  console.log(111)
}

//监听输入框 非空效验
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

//select val
$('#coinSelect').on('change',function () {
     com_asset = $(this).val()
     console.log(com_asset)
})
//转账
$('#change').off('click').on('click', function () {
  event.stopPropagation();
  //非空效验
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
  };

  var com_prik = $('#com_adress').val();
  var go_text = $('#go_cont').val();
  var num_text = $('#num').val();


  var dataOther = {
    "assetName": com_asset,
    "Address": com_text,
    "toAddress": go_text,
    "Amount": num_text
  }
  var dataTrx = {
      "Address": com_text,
      "toAddress": go_text,
      "Amount": num_text
    }
  if(com_asset == 'TRX'){
      ajaxRequest("POST", transTrx, dataTrx, TransTrxSuccessCallback, TransFailureCallback)
  } else{
      ajaxRequest("POST", transOther, dataOther, TransTrxSuccessCallback, TransFailureCallback)
  }


})

TransTrxSuccessCallback = function (data) {
  var transaction = getTransActionFromBase64String(data);
  var transactionSigned = signTransaction(com_priKeyBytes, transaction);
  var transactionBytes = transactionSigned.serializeBinary();
  var transactionString = byteArray2hexStr(transactionBytes);
  var para = "transactionData=" + transactionString;
  //签名验证
  ajaxRequest("POST", anintran, para, TransBroadSuccessCallback, TransBroadFailureCallback)
};

TransBroadSuccessCallback = function (data) {
    if(data){
        alert("转账成功");
    }else{
        alert("转账失败");
    }

};
TransFailureCallback = function (err) {
  alert("转账失败，生成交易失败");
  console.log('转账失败，生成交易失败')
};

TransBroadFailureCallback = function (err) {
  alert("转账失败，签名失败");
  console.log('转账失败，签名失败')
};
