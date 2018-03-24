



TransSuccessCallback = function (data) {

  var parenthash;
  var parenthashHex;
  var blockNumber;
  var currentBlock = base64DecodeFromString(data);
  var contractList

  var blockData = proto.protocol.Block.deserializeBinary(currentBlock);
  blockNumber = blockData.getBlockHeader().getRawData().getNumber();
  var witnessId = blockData.getBlockHeader().getRawData().getWitnessId();
  var witnessNum=1
  parenthash = blockData.getBlockHeader().getRawData().getParenthash();
  parenthashHex = byteArray2hexStr(parenthash);
  var contraxtType=proto.protocol.Transaction.Contract.ContractType;

  var contractType;
  var contractName;

  var ownerHex = "";
  var toHex = "";
  var amount = 0 ;
  // time
  var time =10;
  var str="";
  function getTx(contractName,ownerHex,amount,toHex,time) {
    str += '<p class="transfer">'
        + '<button >'+contractName+'</button>'
        + '<span class="tran_name">' + ownerHex + '</span>'
        + '<span>将' + amount + ' TRX转帐给</span>'
        + '<span class="tran_name">' + toHex + '</span>'
        + '<span>' + time + '秒钟前</span>'
        + '</p>';

    $("#recentHtml").html(str);

  }



  $("#block_num").text(blockNumber);
  $("#witness_num").text(witnessNum);
  $("#beforeBlock").text(parenthashHex);

  console.log("parenthashHex : " + parenthashHex);

  var witnessNum = 1;

  console.log("blockNumber : " + blockNumber + " witnessId : " + witnessId);

  var txlist = blockData.getTransactionsList();

  if (txlist.length > 0) {

    for (var index in txlist) {
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

            var to = obje.getToAddress();
             toHex = byteArray2hexStr(to);

             amount = obje.getAmount();

            console.log("ownerHex " + ownerHex);
            console.log("to  " + toHex);
            console.log("amount  " + amount);

            getTx(contractName,ownerHex,amount,toHex,time);

            break;

        }
      }






    // get before block
     ajaxRequest("GET", getBlockByNumToView, {num: blockNumber - 1},
          TransSuccessCallback, TransFailureCallback);

    }

  }
};



TransFailureCallback = function (err) {
  console.log('err')
};


// query current block
ajaxRequest( "GET",getBlockToView,{},TransSuccessCallback,TransFailureCallback);



//query recent block

TransSuccessCallback = function (data) {
  var recentBlock = base64DecodeFromString(data);

  var blockData = proto.protocol.Block.deserializeBinary(recentBlock);
  var blockNumber= blockData.getBlockHeader().getRawData().getNumber();
  var witnessAddress= blockData.getBlockHeader().getRawData().getWitnessAddress();
  var witnessAddressHex=byteArray2hexStr(witnessAddress);
  var time= blockData.getBlockHeader().getRawData().getTimestamp();
  var transactionNum= blockData.getTransactionsList().length;
  var contraxtType=proto.protocol.Transaction.Contract.ContractType;
  var big = 255;

 // console.log(blockNumber+" ::: "+time+" ::: "+witnessAddressHex+" ::: "+transactionNum);


  var html= '<div  class="mr_left">'
      + '<p>区块  #'+ blockNumber+'</p>'
      + '<p>'+time+'前</p>'
      + ' </div>'
      + '<div class="mr_right">'
      + '<p>见证人'+witnessAddressHex+'  </p><p>'
      + '<span>交易数：'+transactionNum+'</span>'
      +'<span>大小：'+big+'</span></p></div>';

  $("#recentBlock").html(html);


};

TransFailureCallback = function (err) {
  console.log('err')
};


// ajaxRequest("GET", getBlockByNumToView, {num: 1233},
//     TransSuccessCallback, TransFailureCallback);