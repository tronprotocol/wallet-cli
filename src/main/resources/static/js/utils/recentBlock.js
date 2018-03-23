
var currentNum=$("#block_num").text();
var current=Number(currentNum)


var data ={
 "num" : current -1
};

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

ajaxRequest( "GET",getBlockByNumToView,data,TransSuccessCallback,TransFailureCallback);
