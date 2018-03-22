
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
    var transationHex = byteArray2hexStr(transationAfterSign)
    ajaxRequest("post", signView, transationHex, signSuccessCallback, createAssetFailureCallback)
}

signSuccessCallback = function (data) {
    alert("发行资产成功");
}

createAssetFailureCallback = function (data) {
    alert("发行资产失败");
}