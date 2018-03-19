document.write("<script src='/static/cryptohash/crypto.js'></script>");
document.write("<script src='/static/utils/code.js'></script>></script>");
document.write("<script src='/static/protolib/protobuf.js'></script></script>");
document.write("<script src='/static/js/jquery.js'></script></script>");
document.write("<script src='/static/tronjslib/contract.js'></script></script>");
document.write("<script src='/static/tronjslib/tron.js'></script></script>");
document.write("<script src='/static/tronjslib/troninv.js'></script></script>");

function CreateWitness() {
  var password = $("#password").val();
  var onwerUrl = $("#url").val();
  var priKeyBytes = hexStr2byteArray(password);
  //     CreateWitness(priKeyBytes, onwerUrl);
  var onwerAddress = getAddressFromPriKey(priKeyBytes);
  var address64 = base64Encode(onwerAddress);
  var address64Str = bytesToString(address64);

  $.ajax({
    type: 'post',
    data: {"address": address64Str, "onwerUrl": onwerUrl},
    dataType: 'json',
    url: "/createWitnessToView",

    success: function (data) {
      transaction = getTransActionFromBase64String(data);
      var contractList = getContractListFromTransaction(transaction);
      var contract = contractList[0];  //only one
      var contractType = typeof(contract);
      if (!(contract instanceof proto.protocol.WitnessCreateContract)) {
        alert("Invalid contract type !!!!!");
        return null;
      }

      var ownerAddress1 = contract.getOwnerAddress();
      var url1 = contract.getUrl();
      if (false == arrayEquals(ownerAddress1, onwerAddress)) {
        alert("Error onwerAddress !!!!");
        return;
      }
      var onwerUrlBytes = stringToBytes(onwerUrl);
      if (false == arrayEquals(url1, onwerUrlBytes)) {
        alert("Error url !!!!");
        return;
      }
      var transactionSigned = signTransaction(priKeyBytes, transaction);
      var transactionBytes = transactionSigned.serializeBinary();
      var transactionString = byteArray2hexStr(transactionBytes);

      $.ajax({
        type: 'post',
        dataType: 'json',
        data: {transactionData: transactionString},
        url: "/transactionFromView",
        async: false,
        success: function (result) {
          if (result == true) {
            alert("CreateWitness successful !!!");
          }
          else {
            alert("CreateWitness failure !!!");
          }

        }
      });
    }
  });
}

function CreateAssetIssue() {

  var password = $("#password").val();
  var name = $("#name").val();
  var totalSupplyStr = $("#totalSupplyStr").val();
  var trxNumStr = $("#trxNumStr").val();
  var icoNumStr = $("#icoNumStr").val();
  var startYyyyMmDd = $("#startYyyyMmDd").val();
  var startData = strToDate(startYyyyMmDd);
  var startTime = startData.getTime();
  var endYyyyMmDd = $("#endYyyyMmDd").val();
  var endData = strToDate(endYyyyMmDd);
  var endTime = endData.getTime();
  var decayRatioStr = $("#decayRatioStr").val();
  var voteScore = $("#voteScore").val();
  var description = $("#description").val();
  var urlico = $("#url").val();

  var priKeyBytes = hexStr2byteArray(password);
  var ownerAddress = getAddressFromPriKey(priKeyBytes);
  var owner64String = base64EncodeToString(ownerAddress);

  $.ajax({
    type: 'post',
    data: {
      ownerAddress: owner64String,
      name: name,
      totalSupply: totalSupplyStr,
      trxNum: trxNumStr,
      icoNum: icoNumStr,
      startTime: startTime,
      endTime: endTime,
      decayRatio: decayRatioStr,
      voteScore: voteScore,
      description: description,
      url: urlico
    },
    dataType: 'json',
    url: "/createAssetIssueToView",

    success: function (data) {
      transaction = getTransActionFromBase64String(data);
      var contractList = getContractListFromTransaction(transaction);
      var contract = contractList[0];  //only one
      var contractType = typeof(contract);
      if (!(contract instanceof proto.protocol.AssetIssueContract)) {
        alert("Invalid contract type !!!!!");
        return null;
      }

      var ownerAddress1 = contract.getOwnerAddress();
      var url1 = contract.getUrl();
      if (false == arrayEquals(ownerAddress1, ownerAddress)) {
        alert("Error onwerAddress !!!!");
        return;
      }
      if (url1 == urlico) {
        alert("Error url !!!!");
        return;
      }
      //TODO: more check for befor sign
      var transactionSigned = signTransaction(priKeyBytes, transaction);
      var transactionBytes = transactionSigned.serializeBinary();
      var transactionString = byteArray2hexStr(transactionBytes);

      $.ajax({
        type: 'post',
        dataType: 'json',
        data: {transactionData: transactionString},
        url: "/transactionFromView",
        async: false,
        success: function (result) {
          if (result == true) {
            alert("CreateAssetIssue successful !!!");
          }
          else {
            alert("CreateAssetIssue failure !!!");
          }

        }
      });
    }
  });
}