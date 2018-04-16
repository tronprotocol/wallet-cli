



var assetIssueList;

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

function participateAssetIssue(i) {
    $('.account_list').css('display','none');
    $('#addcount').css('display','block');
    var name = bytesToString(assetIssueList[i].getName());
    var ownerAddress = getBase58CheckAddress(Array.from(assetIssueList[i].getOwnerAddress()));
    var totalSupply = assetIssueList[i].getTotalSupply();
    var startTime = assetIssueList[i].getStartTime();
    var endTime = assetIssueList[i].getEndTime();
    var desc = bytesToString(assetIssueList[i].getDescription())
    var num = assetIssueList[i].getNum();
    var trxNum = assetIssueList[i].getTrxNum();
    var price = trxNum/num;
    var formattedStartTime = formateDate(startTime);
    var formattedEndTime = formateDate(endTime);
    $('#assetName').text(name);
    $('#ownAddress').text(ownerAddress);
    $('#assetTotalSupply').text(totalSupply);
    $('#price').text(price);
    $('#lastTime').text(formattedStartTime + " - " + formattedEndTime);
    $('#desc').text(desc);
}

function calPriceByTrx() {
    if($('#assetNum').val()!="" &&  $('#trxNum').val()!="") {
        var priceByTrx = $('#trxNum').val() / $('#assetNum').val();
        $('#priceByTrx').text(priceByTrx);
    }
}

function checkFunction() {
    $('#assetInfoCheck').text($('#amount').val()+ ' ' +$('#assetName').text());
    var assetNum = $('#price').text() * $('#amount').val();
    var info = assetNum;
    $('#trxNumCheck').text(info);
}

function submitParticipateAssetIssue() {
    var isChecked = $('#checkParticipate').prop('checked');
    if(!isChecked){
        layer.alert($.i18n.prop('layer.confimedtoken'));
        return;
    }
    var name = byteArray2hexStr(stringToBytes($('#assetName').text()));
    var ownerAddress = getBase58CheckAddressFromPriKeyBase64String($('#myKey').val());
    var toAddress = $('#ownAddress').text();
    var amount = $('#amount').val();
    var data = "name=" + name + "&ownerAddress=" + ownerAddress + "&toAddress=" + toAddress + "&amount=" + amount;
    ajaxRequest("post", participateAssetView, data, submitParticipateAssetIssueSuccessCallback, submitAssetIssueFailureCallback)
}

function submitParticipateAssetIssueSuccessCallback(data) {
    var privateKey = base64DecodeFromString($("#myKey").val());
    var transation = getTransActionFromBase64String(data);
    var transationAfterSign = signTransaction(privateKey, transation);
    var transationHex = byteArray2hexStr(transationAfterSign.serializeBinary());
    var para = "transactionData=" + transationHex;
    ajaxRequest("post", signView, para, submitAssetIssueSuccessCallback, submitAssetIssueFailureCallback)
}

function submitAssetIssueSuccessCallback(data) {
    if(data) {
        layer.alert($.i18n.prop('layer.partsuccess'));
        $('#text').css('background','none');
        $('.header span').removeClass('header_active');
        $('#text').load('/html/control.html');
    }else{
        layer.alert($.i18n.prop('layer.partfail'));
    }
}

function submitAssetIssueFailureCallback(data) {
    layer.alert($.i18n.prop('layer.partfail'));
}
function getUrlParam(name){
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var  regex = new RegExp("[\\?&]" + name + "=([^&#]*)"), results = regex.exec(location.search);
    return results == null  ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '))
}
function getAssetListSuccessCallback(data) {
    var curTime = new Date().getTime();
    var content = "";
    var assetIssueListObj = proto.protocol.AssetIssueList.deserializeBinary(base64DecodeFromString(data));
    assetIssueList = assetIssueListObj.getAssetissueList();
    for(var i = 0; i<assetIssueList.length; i++){
        var name = bytesToString(assetIssueList[i].getName());
        var ownerAddress = getBase58CheckAddress(Array.from(assetIssueList[i].getOwnerAddress()));
        var totalSupply = assetIssueList[i].getTotalSupply();
        var startTime = assetIssueList[i].getStartTime();
        var endTime = assetIssueList[i].getEndTime();
        var formattedStartTime = formateDate(startTime);
        var formattedEndTime = formateDate(endTime);
        var partStr = '';
        // if(getUrlParam('language')){
        //     var nowLanguage = getUrlParam('language')
        //     if(nowLanguage == 'zh-CN'){
        //         var partStr = '参与'
        //         var timeClose= '已关闭'
        //     }else if(nowLanguage == 'en'){
        //         var partStr = 'Participate'
        //         var timeClose= 'Closed'
        //     }
        // }else{
            if(getCookie("userLanguage")){
                var nowLanguage = getCookie("userLanguage")
                if(nowLanguage == 'zh-CN'){
                    var partStr = '参与'
                    var timeClose= '已关闭'
                }else if(nowLanguage == 'en'){
                    var partStr = 'Participate'
                    var timeClose= 'Closed'
                }
            }else{
                var partStr = '参与'
                var timeClose= '已关闭'
            }
       // }



        if(!(startTime < curTime && curTime< endTime)){
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td class='stop'>1</td><td><input type='button' class='add_account time_end' value='"+timeClose+"'/></td></tr>";
        }else{
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td > " + formattedStartTime + " - " + formattedEndTime + " </td><td><input type='button' class='add_account' value='"+partStr+"' onclick=\"participateAssetIssue(" + i + ")\"/></td></tr>";
        }
    }
    $('#assetIssueListTable').append(content);

}

function getAssetListFailureCallback(data) {
    layer.alert($.i18n.prop('layer.gettokenfail'));
}



//btn 是否可点击
$(".assetComtrx-checkbox").on("click", function () {
    if ($(this).is(":checked")) {
        $('#creatAssetBtn').removeClass('disable_btn')
    }else{
        $('#creatAssetBtn').addClass('disable_btn')
    }
})
$("#creatAssetBtn").off('click').on('click',function() {
    if(!$(".assetComtrx-checkbox").is(":checked")){
        layer.alert($.i18n.prop('layer.asset'));
        return;
    }else if(!$('.creat_asset_main input[type="text"]').val() != ''){
        layer.alert($.i18n.prop('layer.assetenter'))
        return;
    }
    var address = getBase58CheckAddressFromPriKeyBase64String($("#privateKey").val());
    var start = Date.parse(new Date($("#startTimeFormat").val()));
    var end = Date.parse(new Date($("#endTimeFormat").val()));
    var data = $("#createAssetForm").serialize() + "&ownerAddress=" + address + "&startTime=" + start + "&endTime=" + end;
    ajaxRequest("post", createAssetView, data, createAssetSuccessCallback, createAssetFailureCallback);
})


function createAssetSuccessCallback(data) {
    var privateKey = base64DecodeFromString($("#privateKey").val());
    var transation = getTransActionFromBase64String(data);
    var transationAfterSign = signTransaction(privateKey, transation);
    var transationHex = byteArray2hexStr(transationAfterSign.serializeBinary());
    var para = "transactionData=" + transationHex;
    ajaxRequest("post", signView, para, signSuccessCallback, createAssetFailureCallback)
}

function signSuccessCallback(data) {
    if(data) {
        layer.open({
            type: 1,
            shadeClose: false, //点击遮罩关闭
            content: $.i18n.prop('layer.transfersuccess'),
            btn: ['确定'],
            area: ['250px', '175px'],
            yes: function(index, layero){
                layer.close(index);
                //跳转到首页
                $('#text').load('/html/control.html');
            }

        });
        layer.alert();

        $('.header span').removeClass('header_active');


    }else{
        layer.alert($.i18n.prop('layer.issuefail'));
    }
}

function createAssetFailureCallback(data) {
    layer.alert($.i18n.prop('layer.issuefail'));
}

function getAssetIssueListFun(){
    ajaxRequest("get", assetIssueListView, {}, getAssetListSuccessCallback, getAssetListFailureCallback);
}