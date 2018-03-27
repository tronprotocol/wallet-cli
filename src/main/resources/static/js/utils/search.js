

function searchAccount(address, from) {
    ajaxRequest( "post",getAccountInfo,{'address':address},searchAccountInfoSuccess,searchAccountInfoFailure)
}

searchAccountInfoSuccess = function (data) {
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


    //跳到账户列表
    $('#text').css('background','none');
    $('#acco').addClass('header_active').siblings().removeClass('header_active');
    $('#text').load('/html/searchAccount.html');
    alert(str);
    $('#searchAccountResult').html(str);
}

searchAccountInfoFailure = function (data) {

    //跳到账户列表
    $('#text').css('background','none');
    $('#acco').addClass('header_active').siblings().removeClass('header_active');
    $('#text').load('/html/accountQuery.html');

    var str = '<td align="center" valign="middle">没有查到账户</td>';
    $('#tablHtml').html(str);
    $("#tablHtml tr").hover(function(){
        $(this).addClass('b_acitve')
    },function(){
        $(this).removeClass('b_acitve')
    });
}

