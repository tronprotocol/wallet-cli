

// $(function() {
//     var listPanel = $('#recentHtml');
//     var z = 0; //向上滚动top值
//     function up() { //向上滚动
//         listPanel.animate({ //中奖结果
//             'top': (z - 35) + 'px'
//         }, 1500, 'slow', function() {
//             listPanel.css({
//                 'top': '0px'
//             })
//                 .find("li:first").appendTo(listPanel).animate({opacity:1});;
//             up();
//         });
//     }
//     up();
// });
function getUrlParam(name){
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var  regex = new RegExp("[\\?&]" + name + "=([^&#]*)"), results = regex.exec(location.search);
    return results == null  ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '))
}

TransSuccessCallback = function (data) {

  var parenthash;
  var parenthashHex;
  var blockNumber;
  var currentBlock = base64DecodeFromString(data);
  var contractList;
  var sendTrx,toTrx,contractName;
  var blockData = proto.protocol.Block.deserializeBinary(currentBlock);
  blockNumber = blockData.getBlockHeader().getRawData().getNumber();
  var witnessId = blockData.getBlockHeader().getRawData().getWitnessId();
  var witnessNum = 0;
    $.ajax({
        url:witnessList,
        type: 'get',
        dataType: 'json',
        data:{},
        success: function (data) {
            var bytesWitnessList = base64DecodeFromString(data);
            //调用方法deserializeBinary解析
            var witness = proto.protocol.WitnessList.deserializeBinary(bytesWitnessList);
            var witnessList = witness.getWitnessesList()
            if(witnessList.length >0) {
                for (var i = 0; i < witnessList.length; i++) {
                    //账户地址
                    var Isjobs = witnessList[i].getIsjobs();
                    console.log(Isjobs)
                    if(Isjobs){
                        witnessNum++
                    }
                }
                //活跃超级代表
                $("#witness_num").text(witnessNum);
            }
        },
        fail: function (data) {
            console.log('witnessNum false')
        }
    })

  parenthash = blockData.getBlockHeader().getRawData().getParenthash();
  parenthashHex = byteArray2hexStr(parenthash);
  parenthashHexSix = parenthashHex.substr(0,6) + '...'
  var contraxtType=proto.protocol.Transaction.Contract.ContractType;

  var contractType;

  var ownerHex = "";
  var toHex = "";
  var amount = 0 ;
  // time
  var time =10;
  var str="";
    // if (getUrlParam('language')) {
    //     var nowLanguage = getUrlParam('language')
    //     var nowLanguage = getCookie("userLanguage")
    //     if(nowLanguage == 'zh-CN'){
    //         sendTrx = '将';
    //         toTrx = '转帐给';
    //         contractName = '转帐';
    //     }else if(nowLanguage == 'en'){
    //         sendTrx = 'send';
    //         toTrx = 'to';
    //         contractName = 'send';
    //     }
    // }else{
        if(getCookie("userLanguage")){
            var nowLanguage = getCookie("userLanguage")
            if(nowLanguage == 'zh-CN'){
                sendTrx = '将';
                toTrx = '转帐给';
                contractName = '转帐';
            }else if(nowLanguage == 'en'){
                sendTrx = 'send';
                toTrx = 'to';
                contractName = 'send';
            }
        }else{
            sendTrx = '将';
            toTrx = '转帐给';
            contractName = '转帐';
        }
    //}

  function getTx(contractName,ownerHex,amount,toHex) {
    str += '<li><span class="trans-line fl"></span>'
        + '<i class="fl"></i>'
        + '<p class="type fl">'+contractName+'</p>'
        + '<p class="trans-info fl">'
        + '<span class="red">' + ownerHex + '</span>'
        + '<span>'+sendTrx+'</span>'
        + '<span class="block-num">'+amount+'</span>'
        + '<span>TRX</span>'
        + '<span>'+toTrx+'</span>'
        + '<span class="red">'+toHex+'</span>'
        + '</li>';
    $("#recentHtml").html(str);
  }

  $("#block_num").text('#'+blockNumber);

  $("#beforeBlock").text(parenthashHexSix);


  var txlist = blockData.getTransactionsList();

  if (txlist.length > 0) {
    var txlistFive = txlist.slice(0,6)
    for (var index in txlistFive) {
      var tx = txlist[index];
      contractList = tx.getRawData().getContractList();
      for (var conIndex in contractList) {
        var contract = contractList[conIndex]
        var any = contract.getParameter();

        switch (contract.getType()) {

          case contraxtType.ACCOUNTCREATECONTRACT:
            contractType=contraxtType.ACCOUNTCREATECONTRACT;

            obje = any.unpack(
                proto.protocol.AccountCreateContract.deserializeBinary,
                "protocol.AccountCreateContract");


            break;

          case contraxtType.TRANSFERCONTRACT:
            contractType=contraxtType.TRANSFERCONTRACT;

            obje = any.unpack(
                proto.protocol.TransferContract.deserializeBinary,
                "protocol.TransferContract");

            var owner = obje.getOwnerAddress();
             ownerHex = getBase58CheckAddress(owner);
             ownerHexSix = ownerHex.substr(0,6) + '...';

            var to = obje.getToAddress();
             toHex = getBase58CheckAddress(to);

             toHexSix = toHex.substr(0,6) + '...';

             amount = obje.getAmount()/1000000;


            getTx(contractName,ownerHexSix,amount,toHexSix);

            break;

        }
      }

  }


  }

  $("#recentBlock").html("");
  // get before block
  for(var i= 1;i<7;i++){
    getBeforeBlockByNumToView(getBlockByNumToView,blockNumber,i,TransSuccessByNumToViewCallback,TransFailureCallback)
  }
};


function getBeforeBlockByNumToView(getBlockByNumToView,blockNumber,i,TransSuccessByNumToViewCallback,TransFailureCallback) {
    $.ajax({
        url: getBlockByNumToView,
        type: 'get',
        dataType: 'json',
        data:{num: blockNumber - i},
        async: false,   // 是否异步
        success: function (data) {
            TransSuccessByNumToViewCallback(data)
        },
        fail: function (data) {
            TransFailureCallback(data)
        }
    })
}


TransFailureCallback = function (err) {
  console.log('err')
};


// query current block
ajaxRequest( "GET",getBlockToView,{},TransSuccessCallback,TransFailureCallback);

// setInterval(function () {
//     ajaxRequest( "GET",getBlockToView,{},TransSuccessCallback,TransFailureCallback);
// },100000)

//query recent block

TransSuccessByNumToViewCallback = function (data) {
  var recentBlock = base64DecodeFromString(data);
  //区块大小
  var big = recentBlock.length;
  var blockData = proto.protocol.Block.deserializeBinary(recentBlock);
  var blockNumber= blockData.getBlockHeader().getRawData().getNumber();
  var witnessAddress= blockData.getBlockHeader().getRawData().getWitnessAddress();
  var witnessAddressBase58=getBase58CheckAddress(Array.from(witnessAddress));
  var witnessAddressBase58Six = witnessAddressBase58.substr(0,10) + '...';
  var time= blockData.getBlockHeader().getRawData().getTimestamp();
  var transactionNum= blockData.getTransactionsList().length;
  var contraxtType=proto.protocol.Transaction.Contract.ContractType;
  //var big = 255;
  var timeStr,secTime,minTime,blockStr,represStr,transStr;
    // if (getUrlParam('language')) {
    //     var nowLanguage = getUrlParam("language")
    //     if(nowLanguage == 'zh-CN'){
    //         secTime = '秒前';
    //         minTime = '分前';
    //         blockStr = '区块  #';
    //         represStr = '超级代表: ';
    //         transStr = '交易数：';
    //         transSize = '大小：';
    //     }else if(nowLanguage == 'en'){
    //         secTime = 'seconds ago';
    //         minTime = 'minutes ago';
    //         blockStr = 'block  #';
    //         represStr = 'Mined by: ';
    //         transStr = 'Transactions：';
    //         transSize = 'Size：';
    //     }
    // }else{
        if(getCookie("userLanguage")){
            var nowLanguage = getCookie("userLanguage")
            if(nowLanguage == 'zh-CN'){
                secTime = '秒前';
                minTime = '分前';
                blockStr = '区块  #';
                represStr = '超级代表: ';
                transStr = '交易数：';
                transSize = '大小：';
            }else if(nowLanguage == 'en'){
                secTime = 'seconds ago';
                minTime = 'minutes ago';
                blockStr = 'block  #';
                represStr = 'Mined by: ';
                transStr = 'Transactions：';
                transSize = 'Size：';
            }
        }else{
            secTime = '秒前';
            minTime = '分前';
            blockStr = '区块  #';
            represStr = '超级代表: ';
            transStr = '交易数：';
            transSize = '大小：';
        }
   // }



  //当前时间戳
  var timestamp=new Date().getTime();
  //当前时间戳 - 块生成的时间戳
  var accordTimes = Math.floor(timestamp - time);
  if(Math.floor(accordTimes/1000) > 60){
      var min = Math.floor(accordTimes/60000);
      timeStr = min+ minTime
  }else{
      var sec = Math.floor(accordTimes/1000);
      timeStr = sec+ secTime
  }

  var html= '<li class="clearfix"><div class="block-box fl">'
      + '<p>'+blockStr+ blockNumber+'</p>'
      + '<p>'+timeStr+'</p>'
      + '</div>'
      + '<div class="block-box-info fl">'
      + '<p>'+represStr+witnessAddressBase58Six+'</p><p>'
      + '<span>'+transStr+'<i>'+transactionNum+'</i></span>'
      + '<span>'+transSize+'<i>'+big+'</i>bytes</span></p></div></li>';

      $("#recentBlock").append(html);
};

TransFailureCallback = function (err) {
  console.log('err')
};


// ajaxRequest("GET", getBlockByNumToView, {num: 1233},
//     TransSuccessCallback, TransFailureCallback);
function TrxPriceSuccessCallback(data) {
    var Trxprice = data.data.data[0].price.toFixed(5);
    var change1d = data.data.data[0].change1d;
    $('#trxprice').text(Trxprice)
    if(change1d > 0 &&change1d == 0){
        $('#change1d').css('color','#42bd31')
    }else{
        $('#change1d').css('color','#ea0000')
    }
    $('#change1d').text(change1d+'%')
}
function TrxPriceFailureCallback(data) {
    console.log(data)
}
//TRX Price
function getTrxPrice() {
    ajaxRequest("GET", 'https://block.cc/api/v1/query', {'str':'TRX','act':'q'},TrxPriceSuccessCallback, TrxPriceFailureCallback);
}

getTrxPrice()
setInterval(function () {
    getTrxPrice()
},21600000)

//TRX getTotalTransaction
function TotalTransaction() {
    ajaxRequest("GET", getTotalTrans, {},TrxTotalSuccessCallback, TrxTotaFailureCallback);
}

function TrxTotalSuccessCallback(data) {
    console.log('Success'+data)
    var total = '';
    if(!data){
        total = 0
    }else{
        var totalTransaction = base64DecodeFromString(data);
        var totalData = proto.protocol.NumberMessage.deserializeBinary(totalTransaction);
        var totalNumber= totalData.getNum();
        total = totalNumber
    }
    $('#total').text(total)

}

function TrxTotaFailureCallback(data){
    console.log('TotaFailureCall'+data)
}
//getTotalTransaction
TotalTransaction()