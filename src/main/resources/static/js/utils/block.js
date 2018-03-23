



TransSuccessCallback = function (data) {

  var str = ''

  var contractType;
  var contractList;
  var balance;
  var sendname;
  var toname;
  var time;
  var currentBlock = base64DecodeFromString(data);

  var blockData = proto.protocol.Block.deserializeBinary(currentBlock);
  var blockNumber= blockData.getBlockHeader().getRawData().getNumber();
  var witnessId=blockData.getBlockHeader().getRawData().getWitnessId();
  var witnessNum=1;

  console.log("blockNumber : "+blockNumber+" witnessId : "+witnessId);

  var txlist= blockData.getTransactionsList();

  if(txlist.length >0) {
    for (var i = 0; i < txlist.length; i++) {

      var transaction = txlist[i];
      var contractList = getContractListFromTransaction(transaction);

      for (var i = 0; i < contractList.length; i++) {


        var tx= base64EncodeToString(contractList[i]);

        console.log("tx is : "+tx);

      }


            str += '<p class="transfer">'
                +'<button >转账</button>'
                +'<span class="tran_name">'+sendname+'</span>'
                +'<span>将'+balance+ 'TRX转帐给</span>'
                +'<span class="tran_name">'+toname+'</span>'
                +'<span>'+time+'秒钟前</span>'
                +'</p>';

          }
        }


    $("#block_num").text(blockNumber);
    $("#witness_num").text(witnessNum);



  ajaxRequest( "GET",getBlockByNumToView,{num:blockNumber-1},TransSuccessCallback,TransFailureCallback);

};

TransFailureCallback = function (err) {
  console.log('err')
};

//query current block
ajaxRequest( "GET",getBlockToView,{},TransSuccessCallback,TransFailureCallback);


TransSuccessCallback = function (data) {
  var recentBlock = base64DecodeFromString(data);

  var blockData = proto.protocol.Block.deserializeBinary(recentBlock);
  var blockNumber= blockData.getBlockHeader().getRawData().getNumber();
  var witnessAddress= blockData.getBlockHeader().getRawData().getWitnessAddress();
  var witnessAddressHex=byteArray2hexStr(witnessAddress);
  var time= blockData.getBlockHeader().getRawData().getTimestamp();
  var transactionNum= blockData.getTransactionsList().length;

  var big = 255;

  console.log(blockNumber+" ::: "+time+" ::: "+witnessAddressHex+" ::: "+transactionNum);


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