


ajaxRequest( "GET",getBlockToView,data,TransSuccessCallback,TransFailureCallback);

var data ={

};

TransSuccessCallback = function (data) {

  console.log(data)

  //字符串转byteArray数据格式
  var bytes = stringToBytes(data);

  //从base64字符串中解码出原文，格式为byteArray格式
  var currentBlock = base64Decode(bytes);

  //调用方法deserializeBinary解析
  var blockData = proto.protocol.Block.deserializeBinary(currentBlock);
  var blockNumber= blockData.getBlockHeader().getRawData().getNumber();
  var witnessId=blockData.getBlockHeader().getRawData().getWitnessId();

  var txlist= blockData.getTransactionsList();

  for(var i=0; i<txlist.length;i++){
    var transactionType = txlist[i].getRawData().getType();

    if(transactionType==1){
        var contractList = transactionType.getContractList();
        for(var i=0; i<contractList.length;i++){
         var contractType = contractList[i].getType();
         if(contractType==1){
           console.log("contract is : " + contractType);
         }
        }
    }

    }

};

TransFailureCallback = function (err) {
  console.log('err')
};