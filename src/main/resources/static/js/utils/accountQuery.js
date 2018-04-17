
/**
 *
 方法说明
*
 @method 查询账户列表处理数据数据 QueryAccountSuccess
*
 @param {data}  请求成功返回的数据
*/

 function QueryAccountSuccess(data) {
    var str = ''
    //字符串转byteArray数据格式
    // var bytes = stringToBytes(data);
    //从base64字符串中解码出原文，格式为byteArray格式
    var bytesAccountList = base64DecodeFromString(data);
    //调用方法deserializeBinary解析
    var account = proto.protocol.AccountList.deserializeBinary(bytesAccountList);
    var accountList = account.getAccountsList()

   if(accountList.length >0){
       for(var i = 0; i<accountList.length;i++){
           var name = bytesToString(accountList[i].getAccountName())
           var address = getBase58CheckAddress(Array.from(accountList[i].getAddress()));
           var balance = accountList[i].getBalance();
           var balanceNum = 0;
           if(balance != 0) {
               balanceNum = (balance / 1000000).toFixed(6);
           }
           str += '<tr>'
               +'<td><span class="num">'+(i+1)+'</span></td>'
               +'<td style="table-layout:fixed;;word-break:break-all">'+address+'</td>'
               // +'<td style="table-layout:fixed;;word-break:break-all">'+name+'</td>'
               +'<td>'+balanceNum+' TRX</td>'
               +'</tr>';
       }
   }else{
        str = '<td align="center" valign="middle">没有查到账户</td>'
        }

    $('#tablHtml').html(str);
    $("#tablHtml tr").hover(function(){
        $(this).addClass('b_acitve')
    },function(){
        $(this).removeClass('b_acitve')
    });


}


/**
 *
 方法说明
 *
 @method 查询账户列表处理数据数据 QueryAccountFail
 *
 @param {data}  请求失败返回的数据
 */

function QueryAccountFail(data) {
    console.log('error');
}

/**
 *
 方法说明
 *
 @method 查询账户列表 getAccountList
 *
 @param
 */

function getAccountList( ) {
    ajaxRequest( "get",accountList,{},QueryAccountSuccess,QueryAccountFail)
}


//调用接口
getAccountList()

