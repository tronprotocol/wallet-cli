
function formateDate(timeStamp) {
    var dateObj = new Date(timeStamp);
    var year=dateObj.getFullYear();
    var month=dateObj.getMonth() + 1;
    if(month<10) month = "0" + month;
    var date=dateObj.getDate();
    if(date<10) date = "0" + date;
    var hour=dateObj.getHours();
    if(hour<10) hour = "0" + hour;
    var minute=dateObj.getMinutes();
    if(minute<10) minute = "0" + minute;
    var second=dateObj.getSeconds();
    if(second<10) second = "0" + second;
    return year+"-"+month+"-"+date+" "+hour+":"+minute+":"+second;
}

getAssetListSuccessCallback = function (data) {
    var curTime = new Date().getTime();
    var content = "";
    var assetIssueListObj = proto.protocol.AssetIssueList.deserializeBinary(base64DecodeFromString(data));
    var assetIssueList = assetIssueListObj.getAssetissueList();
    for(var i = 0; i<assetIssueList.length; i++){
        var name = bytesToString(assetIssueList[i].getName());
        var ownerAddress = byteArray2hexStr(assetIssueList[i].getOwnerAddress());
        var totalSupply = assetIssueList[i].getTotalSupply();
        var startTime = assetIssueList[i].getStartTime();
        var endTime = assetIssueList[i].getEndTime();
        var formattedStartTime = formateDate(startTime);
        var formattedEndTime = formateDate(endTime);
        if((startTime < curTime && curTime< endTime)){
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td class='stop'>1</td><td><input type='button' class='add_account time_end' value='参与'/></td></tr>";
        }else{
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td > " + formattedStartTime + " - " + formattedEndTime + " </td><td><input type='button' class='add_account' value='参与'/></td></tr>";
        }
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
    ajaxRequest("get", "/getAssetIssueList", {}, getAssetListSuccessCallback, getAssetListFailureCallback);
}
