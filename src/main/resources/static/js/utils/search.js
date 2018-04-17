

var addr = $('#searchInput').val();

if(getStringType(addr) == 1) {
    searchAccount(addr);
}
if(getStringType(addr) == 2) {
    searchBlock(addr);
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
        var witnessAddressHex = getBase58CheckAddress(Array.from(witnessAddress));
        var time = blockData.getBlockHeader().getRawData().getTimestamp();
        var parentHash = blockData.getBlockHeader().getRawData().getParenthash_asB64();

        var txList = blockData.getTransactionsList();
        var transactionNum = txList.length;
        var contraxtType = proto.protocol.Transaction.Contract.ContractType;

        $(".search_title_txt").text("#" + blockNumber);
        $("#blockHeight").text(blockNumber);
        $("#createTime").text(formateDate(time));
        $("#witness").text(witnessAddressHex);
        $("#parentHash").text(parentHash);
        $("#bytesNum").text(big + "bytes");
        $("#txNum").text(transactionNum);

        if (txList.length > 0) {
            var htmlStr = "";
            var txTopn = txList.slice(0,12)
            for (var index in txTopn) {
                var tx = txList[index];
                var contractList = tx.getRawData().getContractList();
                for (var conIndex in contractList) {
                    var contract = contractList[conIndex]
                    var any = contract.getParameter();
                    switch (contract.getType()) {

                        case contraxtType.TRANSFERCONTRACT:

                            var obj = any.unpack( proto.protocol.TransferContract.deserializeBinary, "protocol.TransferContract");
                            var ownerHex = getBase58CheckAddress(Array.from(obj.getOwnerAddress()));
                            var ownerHexSix = ownerHex.substr(0,10) + '...';
                            var toHex = getBase58CheckAddress(Array.from(obj.getToAddress()));
                            var toHexSix = toHex.substr(0,10) + '...';
                            var amount = obj.getAmount()/1000000;

                            htmlStr += "<div class='search_table_list'>"
                                + "<div class='search_table_li table_txt_elpis'>" + ownerHexSix + "</div>"
                                + "<div class='search_table_li table_txt_red'>将" + amount + "TRX转账给</div>"
                                + "<div class='search_table_li table_txt_elpis'>" + toHexSix + "</div>"
                                + "</div>";
                            break;
                    }
                }
            }
            $("#txList").html(htmlStr);
        }
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

var assetIssueContractObj;
function participateAssetIssueInSearch() {
    $('.account_list').css('display','none');
    $('#addcount').css('display','block');
    var name = bytesToString(assetIssueContractObj.getName());
    var ownerAddress = getBase58CheckAddress(Array.from(assetIssueContractObj.getOwnerAddress()));
    var totalSupply = assetIssueContractObj.getTotalSupply();
    var startTime = assetIssueContractObj.getStartTime();
    var endTime = assetIssueContractObj.getEndTime();
    var desc = bytesToString(assetIssueContractObj.getDescription())
    var num = assetIssueContractObj.getNum();
    var trxNum = assetIssueContractObj.getTrxNum();
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

function searchAssetSuccess(data) {
    if(data) {
        var curTime = new Date().getTime();
        var content = "";
        var assetIssueContract = proto.protocol.AssetIssueContract.deserializeBinary(base64DecodeFromString(data));
        assetIssueContractObj = assetIssueContract;
        var name = bytesToString(assetIssueContract.getName());
        var ownerAddress = getBase58CheckAddress(Array.from(assetIssueContract.getOwnerAddress()));
        var totalSupply = assetIssueContract.getTotalSupply();
        var startTime = assetIssueContract.getStartTime();
        var endTime = assetIssueContract.getEndTime();
        var formattedStartTime = formateDate(startTime);
        var formattedEndTime = formateDate(endTime);
        if (!(startTime < curTime && curTime < endTime)) {
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td class='stop'>1</td><td><input type='button' class='add_account time_end' value='参与'/></td></tr>";
        } else {
            content += "<tr><td>" + name + "</td><td>" + ownerAddress + "</td><td>" + totalSupply + "</td> <td > " + formattedStartTime + " - " + formattedEndTime + " </td><td><input type='button' class='add_account' value='参与' onclick=\"participateAssetIssueInSearch()\"/></td></tr>";
        }
        $('#assetIssueListTable').append(content);
    }
}

function searchAssetFailure(data) {
    layer.alert($.i18n.prop('layer.gettokenfail'));
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
        var address = getBase58CheckAddress(Array.from(account.getAddress()));
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