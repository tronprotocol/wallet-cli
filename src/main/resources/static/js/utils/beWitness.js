$(document).ready(function(){
    //btn 是否可点击
    $(".c_check input").on("click", function () {
        if ($(this).is(":checked")) {
            $('.ord_btn').removeClass('disable_btn')
        } else {
            $('.ord_btn').addClass('disable_btn')
        }
    })


    $('.ord_btn').on('click',function () {
        if(!$(this).hasClass('disable_btn')){

        }else{
            alert('请阅读见证人通知，并勾选')
        }
    })




});