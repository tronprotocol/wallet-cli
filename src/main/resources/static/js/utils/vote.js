

function voteInit() {
    ajaxRequest( "get",witnessList,{},QueryWitnessSuccess,QueryWitnessFail)
}

function QueryWitnessSuccess(data) {
    var str = ''
    var bytesWitnessList = base64DecodeFromString(data);
    var witness = proto.protocol.WitnessList.deserializeBinary(bytesWitnessList);
    var witnessList = witness.getWitnessesList()
    $('#witnessList').html("");
    if(witnessList.length >0){
        for(var i = 0; i<witnessList.length;i++){
            //账户地址
            var address = getBase58CheckAddress(Array.from(witnessList[i].getAddress()));
            //上次生成块
            var latestblocknum = witnessList[i].getLatestblocknum()
            //总出块数
            var producedtotal =  witnessList[i].getTotalproduced()
            //缺失区块数
            var missedtotal = witnessList[i].getTotalmissed()
            //得票
            var votecount = witnessList[i].getVotecount();
            // var name = byteArray2hexStr(accountList[i].getAccountName())
            // var balance = accountList[i].getBalance();
            str += '<tr>'
                +'<td><span class="num">'+(i+1)+'</span></td>'
                +'<td>'+address+'</td>'
                +'<td>'+votecount+'</td>'
                +'<td><input class="vote_act" type="text" placeholder="请输入您的投票数" /></td>'
                +'</tr>';
        }
    }else{
        str = '<td align="center" valign="middle">没有查到账户</td>'
    }
    $('#witnessList').append(str);
    $("#witnessList tr").hover(function(){
        $(this).addClass('b_acitve')
    },function(){
        $(this).removeClass('b_acitve')
    });
}

function QueryWitnessFail(data) {
    console.log(data);
    console.log('error');
}

function voteSubmit() {
    var ownerAddress = getBase58CheckAddressFromPriKeyBase64String($("#myKey").val());
    var para = "{\"owner\": \"" + ownerAddress + "\", \"list\": [";

    for(var i=0; i<$("#witnessList tr").length; i++){
        var addressHex = $("#witnessList tr").eq(i).find('td').eq(1).text();
        var voteCount = $("#witnessList tr").eq(i).find('td input').eq(0).val();
        if(voteCount > 0){
            para += "{\"address\": \"" + addressHex + "\", \"amount\":\"" + voteCount + "\"},"
        }
    }
    para = para.substr(0, para.length - 1);
    para += "]}";

    $.ajax({
        type: "POST",
        url: voteWitnessView,
        dataType: "json",
        contentType: "application/json",
        data: para,
        success: voteSubmitSuccessCallback,
        error: voteFailureCallback,
    });
}

voteSubmitSuccessCallback = function (data) {
    var privateKey = base64DecodeFromString($("#myKey").val());
    var transation = getTransActionFromBase64String(data);
    var transationAfterSign = signTransaction(privateKey, transation);
    var transationHex = byteArray2hexStr(transationAfterSign.serializeBinary());
    var para = "transactionData=" + transationHex;
    ajaxRequest("post", signView, para, voteSuccessCallback, voteFailureCallback)
}

voteSuccessCallback = function (data) {
    layer.alert($.i18n.prop('layer.votesuccess'));
}

voteFailureCallback = function (data) {
    layer.alert($.i18n.prop('layer.votefail'));
}
