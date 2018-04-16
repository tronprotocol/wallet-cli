



/**
 *
 方法说明
 *
 @method 查询超级代表处理数据数据 QueryAccountSuccess
 *
 @param {data}  请求成功返回的数据
 */

function QueryWitnessSuccess(data) {
    var str = ''
    //字符串转byteArray数据格式
    //var bytes = stringToBytes(data);
    //从base64字符串中解码出原文，格式为byteArray格式
    var bytesWitnessList = base64DecodeFromString(data);

    //调用方法deserializeBinary解析
    var witness = proto.protocol.WitnessList.deserializeBinary(bytesWitnessList);

    var witnessList = witness.getWitnessesList()

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
                +'<td style="table-layout:fixed;word-break:break-all">'+address+'</td>'
                // +'<td>'+latestblocknum+'</td>'
                // +'<td>'+producedtotal+'</td>'
                // +'<td>'+missedtotal+'</td>'
                +'<td>'+votecount+' TRX</td>'
                +'</tr>';
        }
    }else{
        str = '<td align="center" valign="middle">没有查到账户</td>'
    }

    $('#witnessDate').append(str)

    $("#witnessDate tr").hover(function(){
        $(this).addClass('b_acitve')
    },function(){
        $(this).removeClass('b_acitve')
    });
}


/**
 *
 方法说明
 *
 @method 查询账户列表处理数据数据 QueryWitnessFail
 *
 @param {data}  请求失败返回的数据
 */

function QueryWitnessFail(data) {
    console.log(data);
    console.log('error');
}

/**
 *
 方法说明
 *
 @method 查询账户列表 getWitnessList
 *
 @param
 */

function getWitnessList( ) {
    ajaxRequest( "get",witnessList,{},QueryWitnessSuccess,QueryWitnessFail)
}


//调用接口
getWitnessList()

