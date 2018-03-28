

var addr = $('#searchInput').val();

if(getStringType(addr) == 1) {
    searchAccount(addr);
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
            TransSuccessByNumToViewCallback(data)
        },
        fail: function (data) {
            TransFailureCallback(data)
        }
    })
}


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


