

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

TransSuccessCallback = function (data) {

  var parenthash;
  var parenthashHex;
  var blockNumber;
  var currentBlock = base64DecodeFromString(data);
  var contractList;

  var blockData = proto.protocol.Block.deserializeBinary(currentBlock);
  blockNumber = blockData.getBlockHeader().getRawData().getNumber();
  var witnessId = blockData.getBlockHeader().getRawData().getWitnessId();
  var witnessNum=1;
  parenthash = blockData.getBlockHeader().getRawData().getParenthash();
  parenthashHex = byteArray2hexStr(parenthash);
  parenthashHexSix = parenthashHex.substr(0,6) + '...'
  var contraxtType=proto.protocol.Transaction.Contract.ContractType;

  var contractType;
  var contractName;

  var ownerHex = "";
  var toHex = "";
  var amount = 0 ;
  // time
  var time =10;
  var str="";
  function getTx(contractName,ownerHex,amount,toHex) {
    str += '<li class="transfer">'
        + '<button >'+contractName+'</button>'
        + '<span class="tran_name">' + ownerHex + '</span>'
        + '<span>将' + amount + ' TRX转帐给</span>'
        + '<span class="tran_name">' + toHex + '</span>'
        // + '<span>' + time + '秒钟前</span>'
        + '</li>';
    $("#recentHtml").html(str);
  }

  $("#block_num").text('#'+blockNumber);
  $("#witness_num").text(witnessNum);
  $("#beforeBlock").text(parenthashHexSix);

 // console.log("parenthashHex : " + parenthashHex);

  var witnessNum = 1;

  console.log("blockNumber : " + blockNumber + " witnessId : " + witnessId);

  var txlist = blockData.getTransactionsList();

  if (txlist.length > 0) {
    var txlistFive = txlist.slice(0,12)
    for (var index in txlistFive) {
      // console.log(txlist[index]);
      var tx = txlist[index];
      contractList = tx.getRawData().getContractList();
      //console.log(contractList)
      for (var conIndex in contractList) {
        var contract = contractList[conIndex]
        var any = contract.getParameter();
        //    console.log("contract  "+contract);
        //   console.log("type1  "+contract.getType());
        switch (contract.getType()) {

          case contraxtType.ACCOUNTCREATECONTRACT:
            contractType=contraxtType.ACCOUNTCREATECONTRACT;

            obje = any.unpack(
                proto.protocol.AccountCreateContract.deserializeBinary,
                "protocol.AccountCreateContract");


            break;

          case contraxtType.TRANSFERCONTRACT:
            contractType=contraxtType.TRANSFERCONTRACT;
            contractName="转账";

            obje = any.unpack(
                proto.protocol.TransferContract.deserializeBinary,
                "protocol.TransferContract");

            var owner = obje.getOwnerAddress();
             ownerHex = byteArray2hexStr(owner);
             ownerHexSix = ownerHex.substr(0,6) + '...';

            var to = obje.getToAddress();
             toHex = byteArray2hexStr(to);

             toHexSix = toHex.substr(0,6) + '...';

             amount = obje.getAmount();

            // console.log("ownerHex " + ownerHex);
            // console.log("to  " + toHex);
            // console.log("amount  " + amount);

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

setInterval(function () {
    ajaxRequest( "GET",getBlockToView,{},TransSuccessCallback,TransFailureCallback);
},100000)

//query recent block

TransSuccessByNumToViewCallback = function (data) {
  var recentBlock = base64DecodeFromString(data);
  //区块大小
  var big = recentBlock.length;
  var blockData = proto.protocol.Block.deserializeBinary(recentBlock);
  var blockNumber= blockData.getBlockHeader().getRawData().getNumber();
  var witnessAddress= blockData.getBlockHeader().getRawData().getWitnessAddress();
  var witnessAddressHex=byteArray2hexStr(witnessAddress);
  var witnessAddressHexSix = witnessAddressHex.substr(0,10) + '...';
  var time= blockData.getBlockHeader().getRawData().getTimestamp();
  var transactionNum= blockData.getTransactionsList().length;
  var contraxtType=proto.protocol.Transaction.Contract.ContractType;
  //var big = 255;
  var timeStr = '';
  //当前时间戳
  var timestamp=new Date().getTime();
  //当前时间戳 - 块生成的时间戳
  var accordTimes = Math.floor(timestamp - time);
  console.log('accordTimes====='+accordTimes);
  if(Math.floor(accordTimes/1000) > 60){
      var sec = Math.floor(accordTimes/60000);
      timeStr = sec+ '分'
  }else{
      var sec = Math.floor(accordTimes/1000);
      timeStr = sec+ '秒'
  }



  //console.log(blockNumber+" ::: "+time+" ::: "+witnessAddressHex+" ::: "+transactionNum);


  var html= '<div class="before-block"><div  class="mr_left">'
      + '<p>区块  #'+ blockNumber+'</p>'
      + '<p>'+timeStr+'前</p>'
      + ' </div>'
      + '<div class="mr_right">'
      + '<p>出块人: '+witnessAddressHexSix+'  </p><p>'
      + '<span>交易数：'+transactionNum+'</span>'
      +'<span>大小：'+big+'bytes</span></p></div></div>';

      $("#recentBlock").append(html);
};

TransFailureCallback = function (err) {
  console.log('err')
};


// ajaxRequest("GET", getBlockByNumToView, {num: 1233},
//     TransSuccessCallback, TransFailureCallback);