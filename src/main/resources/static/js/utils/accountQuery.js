
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
    var bytes = stringToBytes(data);

    //从base64字符串中解码出原文，格式为byteArray格式
    var bytesAccountList = base64Decode(bytes);

    //调用方法deserializeBinary解析
    var accountList = proto.protocol.AccountList.deserializeBinary(bytesAccountList);

    console.log('accountList'+accountList+'len'+accountList.length)
    //账户名称
    var name =  account.getAccountName()
    var nameString = byteArray2hexStr(name);
    console.log("nameString:: " + nameString)
    var balance = account.getBalance();
    console.log("balance:: " + balance);
    str += '<tr>'
       // +'<td>'+addressHex+'</td>'
        +'<td style="table-layout:fixed;width=500px;word-break:break-all">'+nameString+'</td>'
        +'<td>'+balance+'</td>'
        +'</tr>';
// }
    $('#tablHtml').html(str)
}


/**
 *
 方法说明
 *
 @method 查询账户列表处理数据数据 QueryAccountSuccess
 *
 @param {data}  请求失败返回的数据
 */

function QueryAccountFail(data) {
    console.log(data);
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

