

var addr = $('#searchInput').val();

if(getStringType(addr) == 1) {
    searchAccount(addr);
}
if(getStringType(addr) == 2) {
    searchBlock(addr);
}
if(getStringType(addr) == 3) {
    searchAsset(addr);
}

function searchBlock(height){
    $.ajax({
        url: getBlockByNumToView,
        type: 'get',
        dataType: 'json',
        data:{num: height},
        async: true,   // 是否异步
        success: function (data) {
            searchBlockSuccessCallback(data)
        },
        fail: function (data) {
            searchBlockFailureCallback(data)
        }
    })
}



function searchBlockSuccessCallback(data) {
    if(data) {
        var recentBlock = base64DecodeFromString(data);
        //区块大小
        var big = recentBlock.length;
        var blockData = proto.protocol.Block.deserializeBinary(recentBlock);
        var blockNumber = blockData.getBlockHeader().getRawData().getNumber();
        var witnessAddress = blockData.getBlockHeader().getRawData().getWitnessAddress();
        var witnessAddressHex = byteArray2hexStr(witnessAddress);
        var witnessAddressHexSix = witnessAddressHex.substr(0, 10) + '...';
        var time = blockData.getBlockHeader().getRawData().getTimestamp();
        var parentHash = blockData.getBlockHeader().getRawData().getParenthash_asB64();

        var txList = blockData.getTransactionsList();
        var transactionNum = txList.length;
        var contraxtType = proto.protocol.Transaction.Contract.ContractType;



        if (txList.length > 0) {
            var txTopn = txList.slice(0,12)
            for (var index in txTopn) {
                var tx = txList[index];
                var contractList = tx.getRawData().getContractList();
                for (var conIndex in contractList) {
                    var contract = contractList[conIndex]
                    var any = contract.getParameter();
                    switch (contract.getType()) {

                        case contraxtType.TRANSFERCONTRACT:
                           // contractType = contraxtType.TRANSFERCONTRACT;
                            var obj = any.unpack( proto.protocol.TransferContract.deserializeBinary, "protocol.TransferContract");
                            var ownerHex = byteArray2hexStr(obj.getOwnerAddress());
                            var ownerHexSix = ownerHex.substr(0,6) + '...';
                            var toHex = byteArray2hexStr(obj.getToAddress());
                            var toHexSix = toHex.substr(0,6) + '...';
                            var amount = obj.getAmount();
                            alert(ownerHex + "\t" + toHex + "\t" + amount);
                            break;
                    }
                }

            }
        }

        //
        // var timeStr,secTime,minTime,blockStr,represStr,transStr;
        //
        // if(getCookie("userLanguage")){
        //     nowLanguage = getCookie("userLanguage")
        // }else{
        //     secTime = '秒前';
        //     minTime = '分前';
        //     blockStr = '区块  #';
        //     represStr = '超级代表: ';
        //     transStr = '交易数：';
        //     transSize = '大小：';
        //
        // }
        // if(nowLanguage == 'zh-CN'){
        //     secTime = '秒前';
        //     minTime = '分前';
        //     blockStr = '区块  #';
        //     represStr = '超级代表: ';
        //     transStr = '交易数：';
        //     transSize = '大小：';
        // }else if(nowLanguage == 'en'){
        //     secTime = 'seconds ago';
        //     minTime = 'minutes ago';
        //     blockStr = 'block  #';
        //     represStr = 'Mined by: ';
        //     transStr = 'Transactions：';
        //     transSize = 'Size：';
        // }
        // //当前时间戳
        // var timestamp=new Date().getTime();
        // //当前时间戳 - 块生成的时间戳
        // var accordTimes = Math.floor(timestamp - time);
        // console.log('accordTimes====='+accordTimes);
        // if(Math.floor(accordTimes/1000) > 60){
        //     var min = Math.floor(accordTimes/60000);
        //     timeStr = min+ minTime
        // }else{
        //     var sec = Math.floor(accordTimes/1000);
        //     timeStr = sec+ secTime
        // }
        // var html= '<div class="before-block"><div  class="mr_left">'
        //     + '<p>'+blockStr+ blockNumber+'</p>'
        //     + '<p>'+timeStr+'</p>'
        //     + ' </div>'
        //     + '<div class="mr_right">'
        //     + '<p>'+represStr+witnessAddressHexSix+'  </p><p>'
        //     + '<span>'+transStr+transactionNum+'</span>'
        //     +'<span>'+transSize+big+'bytes</span></p></div></div>';
        //
        // $("#recentBlock").append(html);
    }
};

function searchBlockFailureCallback(err) {
    console.log('err')
};


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

function searchAssetSuccess(data) {
    if(data) {
        var curTime = new Date().getTime();
        var content = "";
        var assetIssueContract = proto.protocol.AssetIssueContract.deserializeBinary(base64DecodeFromString(data));
        var name = bytesToString(assetIssueContract.getName());
        var ownerAddress = byteArray2hexStr(assetIssueContract.getOwnerAddress());
        var totalSupply = assetIssueContract.getTotalSupply();
        var startTime = assetIssueContract.getStartTime();
        var endTime = assetIssueContract.getEndTime();
        var formattedStartTime = formateDate(startTime);
        var formattedEndTime = formateDate(endTime);
        if (!(startTime < curTime && curTime < endTime)) {
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td class='stop'>1</td><td><input type='button' class='add_account time_end' value='参与'/></td></tr>";
        } else {
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td > " + formattedStartTime + " - " + formattedEndTime + " </td><td><input type='button' class='add_account' value='参与' onclick=\"participateAssetIssue(" + i + ")\"/></td></tr>";
        }
        $('#searchAssetResult').append(content);
    }
}

function searchAssetFailure(data) {
    layer.alert("获取资产列表失败");
}

function searchAsset(assetNameStr) {
    ajaxRequest("post", getAssetByNameView, {'assetName':assetNameStr}, searchAssetSuccess, searchAssetFailure);
}

function searchAccount(address) {
    ajaxRequest("post", getAccountInfo, {'address':address}, searchAccountInfoSuccess, searchAccountInfoFailure)
}

function searchAccountInfoSuccess(data) {
    var str = ''
    var bytesAccount = base64DecodeFromString(data);
    //调用方法deserializeBinary解析
    var account = proto.protocol.Account.deserializeBinary(bytesAccount);

    if(account != null){
        var name = bytesToString(account.getAccountName())
        var address = byteArray2hexStr(account.getAddress())
        var balance = account.getBalance();
        var balanceNum = 0;
        if(balance != 0) {
            balanceNum = (balance / 1000000).toFixed(6);
        }
        str += '<tr>'
            +'<td><span class="num">1</span></td>'
            +'<td style="table-layout:fixed;;word-break:break-all">'+address+'</td>'
            +'<td style="table-layout:fixed;;word-break:break-all">'+name+'</td>'
            +'<td>'+balanceNum+' TRX</td>'
            +'</tr>';
    }else{
        str = '<td align="center" valign="middle">没有查到账户</td>'
    }
    $('#searchAccountResult').html(str);
}

function searchAccountInfoFailure(data) {
    var str = '<td align="center" valign="middle">没有查到账户</td>';
    $('#searchAccountResult').html(str);
}


