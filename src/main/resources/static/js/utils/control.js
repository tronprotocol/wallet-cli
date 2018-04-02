//侧边栏
$(".c_form li").each(function(i,item){
    $(this).on('click',function () {
        $(this).addClass('c_active').siblings().removeClass('c_active');
        $('.c_table>div').eq(i).show().siblings().hide();
    })
    $('#transfer_accounts').on('click',function () {

        $('#text').load('/html/transform.html');

    })
});




/**
 *
 方法说明
 *
 @method 查询账户详情处理数据数据 QueryAccountInfoSuccess
 *
 @param {data}  请求成功返回的数据
 */

function QueryAccountInfoSuccess(data) {
    var str = ''
    //从base64字符串中解码出原文，格式为byteArray格式
    var bytesAccountInfo = base64DecodeFromString(data);
    console.log(bytesAccountInfo)
    //调用方法deserializeBinary解析
    // var witness = proto.protocol.WitnessList.deserializeBinary(bytesWitnessList);
    // var witnessList = witness.getWitnessesList()
    //
    // if(witnessList.length >0){
    //     for(var i = 0; i<witnessList.length;i++){
    //         //账户地址
    //         var address = byteArray2hexStr(witnessList[i].getAddress());
    //         //上次生成块
    //         var latestblocknum = witnessList[i].getLatestblocknum()
    //         //总出块数
    //         var producedtotal =  witnessList[i].getTotalproduced()
    //         //缺失区块数
    //         var missedtotal = witnessList[i].getTotalmissed()
    //         //得票
    //         var votecount = witnessList[i].getVotecount();
    //         // var name = byteArray2hexStr(accountList[i].getAccountName())
    //         // var balance = accountList[i].getBalance();
    //         str += '<tr>'
    //             +'<td><span class="num">'+(i+1)+'</span></td>'
    //             +'<td style="table-layout:fixed;word-break:break-all">'+address+'</td>'
    //             +'<td>'+latestblocknum+'</td>'
    //             +'<td>'+producedtotal+'</td>'
    //             +'<td>'+missedtotal+'</td>'
    //             +'<td>'+votecount+'</td>'
    //             +'</tr>';
    //     }
    // }else{
    //     str = '<td align="center" valign="middle">没有查到账户</td>'
    // }
    //
    // $('#witnessDate').append(str)
    //
    // $("#witnessDate tr").hover(function(){
    //     $(this).addClass('b_acitve')
    // },function(){
    //     $(this).removeClass('b_acitve')
    // });
}


/**
 *
 方法说明
 *
 @method 查询账户详情处理数据数据 QueryAccountInfoFail
 *
 @param {data}  请求失败返回的数据
 */

function QueryAccountInfoFail(data) {
    console.log(data);
    console.log('error');
}

/**
 *
 方法说明
 *
 @method 查询账户详情 getAcInfo
 *
 @param
 */

function getAcInfo() {
    ajaxRequest( "post",getAccountInfo,{},QueryAccountInfoSuccess,QueryAccountInfoFail)
}


//调用接口
getAcInfo()






