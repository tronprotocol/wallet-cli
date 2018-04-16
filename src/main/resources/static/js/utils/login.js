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
$('.creat-account-btn').on('click',function () {
    $('#wel_login').css('display','none');
    $('#article_login').css('display','block')
});

$('.wel-login-btn').on('click',function () {

    $('.motal-mask').css('display','block')
    $('.motal').css('display','block')
});
$('#repawd').bind('input propertychange',function(){
    $('.mona_warn').css('display','none')
})
$('.no,#motal-close').on('click',function () {
    $('.motal').css('display','none');
    $('.mona_warn').css('display','none');
    $('#repawd').val('');
    $('.motal-mask').css('display','none')
})
$('#login').on('click',function () {
    if($('#repawd').val() == ''||$('#repawd').val().length<20){
        $('.mona_warn').css('display','block')
    }else{
        $('.header span').eq(0).addClass('header_active');
        $('#create').css('display','none');
        $('#header_login').css('display','inline-block');
        $('#center').css('display','inline-block');
        $('.motal').css('display','none');
        $('.motal-mask').css('display','none');
        window.localStorage.setItem('key',$('#repawd').val());
        $('#repawd').val('');
        $('#text').load('/html/message.html');
        $('body').css('background','#fafbfc');
    }
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
        layer.alert($.i18n.prop('layer.copyfail'));
    }
    document.execCommand('Copy','false',null);
}
$('#submit').on('click',function () {
    priKeyBytes = genPriKey();
    //return address by bytes, priKeyBytes is byte[]
    addressBytes = getAddressFromPriKey(priKeyBytes);
    //return 32 bytes
    address = getBase58CheckAddress(addressBytes);
    accountName = $("#name").val();
    //TODO fix privateKey store
    $("#contents").text(address);
    // priKeyBytes = genPriKey();

    pk = base64EncodeToString(priKeyBytes);
    // console.log(pk)
    $('#pwd').text(pk);
    //prikey_pwd
    prikey_pwd = byteArray2hexStr(priKeyBytes);
    $('#prikey_pwd').text(prikey_pwd)

    if($('.warn-info1').is(":checked")&&$('.warn-info2').is(":checked")&&$('.warn-info3').is(":checked")){
        $('#creatAccount').removeClass('disable_btn')
    }
});

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

$('.warn_list input[type="checkbox"]').on('click',function (i) {
    if($('.warn-info1').is(":checked")&&$('.warn-info2').is(":checked")&&$('.warn-info3').is(":checked")){
        $('#creatAccount').removeClass('disable_btn')
    }
});

$('#creatAccount').on('click',function () {
    if($("#contents").text()&&$("#pwd").text()){
        if($('.warn-info1').is(":checked")&&$('.warn-info2').is(":checked")&&$('.warn-info3').is(":checked")){
           $('.login-prompt-box').css('display','block')
        }else{
            layer.alert($.i18n.prop('layer.accountread'))
        }
    }else{
        layer.alert($.i18n.prop('layer.createdaccount'))
    }
})

$('.prompt-know').on('click',function () {
    //国际化
    $('#create').css('display','none')
    $('#header_login').css('display','inline-block');
    $('#center').css('display','inline-block');
    $('body').css('background','#fafbfc');
    $(this).addClass('header_active').siblings().removeClass('header_active');
    $('#text').load('/html/message.html');
    window.localStorage.setItem('key',pk)
})



















