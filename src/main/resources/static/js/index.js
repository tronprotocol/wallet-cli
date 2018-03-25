/*
*Created by 2018-3-13 wangshanshan
*
 */
// 跳转页面
$(document).ready(function(){
    if( window.localStorage.getItem('key')){
        $('#header_login').css('display','inline-block')
        $('#center').css('display','inline-block')
        $('#create').css('display','none')
    }else{
        $('#header_login').css('display','none')
        $('#center').css('display','none')
        $('#create').css('display','inline-block')
    }

    $("#header_login").click(function(){
        $('#text').css('background','none');
        $('.header span').removeClass('header_active');
        $('#text').load('/html/control.html');
    });
    $("#a_witness").click(function(){
        $('#text').css('background','none');
        $(this).addClass('header_active').siblings().removeClass('header_active');
        $('#text').load('html/witness.html');
    });
    $('#acco').click(function () {
        $('#text').css('background','none');
        $(this).addClass('header_active').siblings().removeClass('header_active');
        $('#text').load('html/accountQuery.html');
    });
    $('.j_left').click(function () {
        $('#text').css('background','none');
        $(this).addClass('header_active').siblings().removeClass('header_active');
        $('#text').load('html/message.html');
    });
    //退出
    $('#center').click(function () {

        window.localStorage.removeItem('key')
        $('#create').css('display','inline-block');
        $('#header_login').css('display','none');
        $('#center').css('display','none');
        $('.header span').removeClass('header_active');
        $('#text').css('background','url(/img/bg.png)')
        $('#text').load('html/login.html');
    });
    $('#money').click(function () {
        $(this).addClass('header_active').siblings().removeClass('header_active');
        $('#text').css('background','url(/img/bg.png)')
        $('#text').load('html/transform.html');
        // if(window.localStorage.getItem('key')){
        //     $('#text').load('html/transform.html');
        // }else{
        //     $('#text').load('html/login.html');
        // }

    });
    $('#create').click(function () {
        $('#text').load('html/login.html');
        $('.header span').removeClass('header_active');
        $('#text').css('background','url(/img/bg.png)')
    });

    //资产发行
    $('#nemoney').click(function () {
        $(this).addClass('header_active').siblings().removeClass('header_active');
        $('#text').load('html/count.html');
        $('#text').css('background','none');
        // if(window.localStorage.getItem('key')){
        //     $('#text').css('background','none');
        //     $('#text').load('html/count.html');
        // }else{
        //     $('#text').load('html/login.html');
        //     $('#text').css('background','url(/img/bg.png)')
        // }

    });
    // $('#a_witness').on('click',function () {
    //     ajaxRequest( "GET",witelist,{},TransSuccessCallback,TransFailureCallback)
    // })

    // TransSuccessCallback = function (data) {
    //     console.log(data);
    //      var bytes = stringToBytes(data);
    //     var bytesDecode = base64Decode(bytes);
    //     // debugger
    //     //var bytesDecode = base64DecodeFromString(data);
    //
    //     var block= proto.protocol.WitnessList.deserializeBinary(bytesDecode);
    //
    //     console.log(block.getWitnessesList().length);
    //
    // };
    //
    // TransFailureCallback = function (err) {
    //     console.log('err')
    // };


})


//





