
$(document).ready(function() {
    $("#creatAssetBtn").click(function() {
        var address = getAddressFromPriKeyBase64String($("#privateKey").val());
        var data = $("#createAssetForm").serialize() + "&ownerAddress=" + address;
        ajaxRequest("post", createAssetView, data, TransSuccessCallback, TransFailureCallback);
    })
})

TransSuccessCallback = function (data) {
    alert(data);
}

TransFailureCallback = function (data) {
    alert("err");
}