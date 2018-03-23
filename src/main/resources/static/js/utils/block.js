



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

        console.log("tx is : "+contractList[i]);
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



};

TransFailureCallback = function (err) {
  console.log('err')
};

ajaxRequest( "GET",getBlockToView,{},TransSuccessCallback,TransFailureCallback);


