


getAssetListSuccessCallback = function (data) {
    var content = "";
    var assetIssueListObj = proto.protocol.AssetIssueList.deserializeBinary(base64DecodeFromString(data));
    var assetIssueList = assetIssueListObj.getAssetissueList();
    for(var i = 0; i<assetIssueList.length; i++){
        var name = bytesToString(assetIssueList[i].getName());
        var ownerAddress = byteArray2hexStr(assetIssueList[i].getOwnerAddress());
        var totalSupply = assetIssueList[i].getTotalSupply();
        content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td>></tr>";
    }
    $('#assetIssueListTable').append(content);

}

getAssetListFailureCallback = function (data) {
    alert("获取资产列表失败");
}


$(document).ready(function() {
    $("#creatAssetBtn").click(function() {
        var address = getAddressFromPriKeyBase64String($("#privateKey").val());
        var data = $("#createAssetForm").serialize() + "&ownerAddress=" + address;
        ajaxRequest("post", createAssetView, data, createAssetSuccessCallback, createAssetFailureCallback);
    })
})

createAssetSuccessCallback = function (data) {
    var privateKey = base64DecodeFromString($("#privateKey").val());
    var transation = getTransActionFromBase64String(data);
    var transationAfterSign = signTransaction(privateKey, transation);
    var transationHex = byteArray2hexStr(transationAfterSign.serializeBinary());
    var para = "transactionData=" + transationHex;
    ajaxRequest("post", signView, para, signSuccessCallback, createAssetFailureCallback)
}

signSuccessCallback = function (data) {
    if(data) {
        alert("发行资产成功");
    }else{
        alert("发行资产失败");
    }
}

createAssetFailureCallback = function (data) {
    alert("发行资产失败");
}

function getAssetIssueListFun(){
    ajaxRequest("get", assetIssueListView, {}, getAssetListSuccessCallback, getAssetListFailureCallback);
}