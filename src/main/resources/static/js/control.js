$(".c_form li").each(function(i,item){
    $(this).on('click',function () {
        $(this).addClass('c_active').siblings().removeClass('c_active');
        $('.c_table>div').eq(i).show().siblings().hide();

    })
});