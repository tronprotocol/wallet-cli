/*
*Created by 2018-3-13
*
 */
var priKeyBytes;
var addressBytes;
var address;
var accountName;
var pk;
//创建账户
$('.login_html').on('click',function () {
    $('#wel_login').css('display','none');
    $('.article_login').css('display','block')
})
//注册账户 复制文本
function copyUrl2 (repeat) {
    var text = document.getElementById(repeat);
    if (document.body.createTextRange) {
        var range = document.body.createTextRange();
        range.moveToElementText(text);
        range.select();
    } else if (window.getSelection) {
        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(text);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        alert("none");
    }
    document.execCommand('Copy','false',null);
}
$('#submit').on('click',function () {
    // 转码 产生秘钥
    priKeyBytes = genPriKey();
    //return address by bytes, priKeyBytes is byte[]
    //根据私钥计算地址，输入私钥的byteArray格式数据，返回地址的byteArray格式数据
    addressBytes = getAddressFromPriKey(priKeyBytes);
    //return 32 bytes
    //计算Hash，SHA256算法，输入数据的byteArray格式数据，返回hash的byteArray格式数据
    address = byteArray2hexStr(addressBytes);
    accountName = $("#name").val();
    //TODO fix privateKey store
   // $("#privateKey").val(priKeyBytes);
    var basePrivateKey= base64Encode(priKeyBytes);
    pk= bytesToString(basePrivateKey);
    $("#contents").text(address);
    // console.log($("#contents").text())

    // priKeyBytes = genPriKey();
    var basePrivateKey= base64Encode(priKeyBytes);
    var pk= bytesToString(basePrivateKey);
    // console.log(pk)
    $('#pwd').text(pk);
    $('#create').css('display','none')
    $('#header_login').css('display','inline-block');
    $('#center').css('display','inline-block');
})

/*
* 转账
*
*
*
* */
var com_text='';
var go_text='' ;
var num_text='' ;
$('#com_adress').bind('input propertychange',function(){
    com_text = $('#com_adress').val();
    console.log(typeof($('#com_adress').val()))

    if(this!=''){
        $('.com_warn').css('display','none');
        return;
    }
})
$('#go_cont').bind('input propertychange',function(){
    go_text =$('#go_cont').val();
    console.log(typeof($('#go_cont').val()))

    if(this!=''){
        $('.go_warn').css('display','none');
        return;
    }
})
$('#num').bind('input propertychange',function(){
    num_text =$('#num').val();
console.log(typeof($('#num').val()) )
    if(this!=''){
        $('.num_warn').css('display','none');
        return;
    }
})
$('#change').on('click',function () {
    if(com_text==''){
        $('.com_warn').css('display','block');
        return;
    }
    if(go_text==''){
        $('.go_warn').css('display','block');
        return;
    }
    if(num_text==''){
        $('.num_warn').css('display','block');
        return;
    };
     ajaxRequest( "POST",trans,data,TransSuccessCallback,TransFailureCallback)
})
var data ={
    "Address":com_text,
    "toAddress":go_text,
    "Amount":num_text
}
TransSuccessCallback = function (data) {
    console.log(data)
};

TransFailureCallback = function (err) {
    console.log('err')
};























