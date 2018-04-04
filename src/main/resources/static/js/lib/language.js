/**
 * cookie操作
 */
var getCookie = function(name, value, options) {
    if (typeof value != 'undefined') { // name and value given, set cookie
        options = options || {};
        if (value === null) {
            value = '';
            options.expires = -1;
        }
        var expires = '';
        if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
            var date;
            if (typeof options.expires == 'number') {
                date = new Date();
                date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
            } else {
                date = options.expires;
            }
            expires = '; expires=' + date.toUTCString(); // use expires attribute, max-age is not supported by IE
        }
        var path = options.path ? '; path=' + options.path : '';
        var domain = options.domain ? '; domain=' + options.domain : '';
        var s = [cookie, expires, path, domain, secure].join('');
        var secure = options.secure ? '; secure' : '';
        var c = [name, '=', encodeURIComponent(value)].join('');
        var cookie = [c, expires, path, domain, secure].join('')
        document.cookie = cookie;
    } else { // only name given, get cookie
        var cookieValue = null;
        if (document.cookie && document.cookie != '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = jQuery.trim(cookies[i]);
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
};

/**
 * 获取浏览器语言类型
 * @return {string} 浏览器国家语言
 */
var getNavLanguage = function(){
    if(navigator.appName == "Netscape"){
        var navLanguage = navigator.language;

        console.log('浏览器语言：'+navLanguage)
        return navLanguage.substr(0,2);
    }
    return false;
}

/**
 * 获取浏览器参数
 * @return {string} 浏览器参数值
 */
var getUrlParam = function (name){
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var  regex = new RegExp("[\\?&]" + name + "=([^&#]*)"), results = regex.exec(location.search);
    return results == null  ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '))
}

/**
 * 获取本地VPN语言类型
 * @return {string} VPN语言类型
 */
var getVpnLanguage = function () {
    if (remote_ip_info.country=='中国') {
        return "zh-CN";
    }else{
        return "en";
    }
}

/**
 * 设置语言类型： 默认为中文
 */
var i18nLanguage = "zh-CN";

/*
设置一下网站支持的语言种类
 */
var webLanguage = ['zh-CN', 'en'];






/**
 * 执行页面i18n方法
 * @return
 */ 
var execI18n = function() {
    /*
    获取一下资源文件名
     */
    var optionEle = $("#i18n_pagename");
    if (optionEle.length < 1) {
        console.log("未找到页面名称元素，请在页面写入\n <meta id=\"i18n_pagename\" content=\"页面名(对应语言包的语言文件名)\">");
        return false;
    }
    ;
    /*
    首先获取用户浏览器设备之前选择过的语言类型
     */
    if (getUrlParam('language')) {
        // 存到缓存中
        getCookie("userLanguage", getUrlParam('language'));
        i18nLanguage = getUrlParam('language');
    } else {
        if (getCookie("userLanguage")) {
            i18nLanguage = getCookie("userLanguage");
        } else {
            // 获取浏览器语言
            var navLanguage = getVpnLanguage();
            if (navLanguage) {
                // 判断是否在网站支持语言数组里
                var charSize = $.inArray(navLanguage, webLanguage);
                if (charSize > -1) {
                    i18nLanguage = navLanguage;
                    // 存到缓存中
                    getCookie("userLanguage", navLanguage);
                }
                ;
            } else {
                console.log("not navigator");
                return false;
            }
        }
    }

        /* 需要引入 i18n 文件*/
        if ($.i18n == undefined) {
            console.log("请引入i18n js 文件")
            return false;
        };


        jQuery.i18n.properties({
            name : 'index', //资源文件名称
            path : '/js/i18n/' + i18nLanguage +'/', //资源文件路径
            mode : 'map', //用Map的方式使用资源文件中的值
            language: i18nLanguage,
            callback: function () {//加载成功后设置显示内容
                console.log("i18n赋值中...");
                try {
                    //初始化页面元素
                    $('[data-i18n-placeholder]').each(function () {
                        $(this).attr('placeholder', $.i18n.prop($(this).data('i18n-placeholder')));
                    });
                    $('[data-i18n-text]').each(function () {
                        //如果text里面还有html需要过滤掉
                        var html = $(this).html();
                        var reg = /<(.*)>/;
                        if (reg.test(html)) {
                            var htmlValue = reg.exec(html)[0];
                            $(this).html(htmlValue + $.i18n.prop($(this).data('i18n-text')));
                        }
                        else {
                            $(this).text($.i18n.prop($(this).data('i18n-text')));
                        }
                    });
                    $('[data-i18n-value]').each(function () {
                        $(this).val($.i18n.prop($(this).data('i18n-value')));
                    });
                }
                catch(ex){ }
                console.log("i18n写入完毕");
            }
        });

        // /*
        // 这里需要进行i18n的翻译
        //  */
        // jQuery.i18n.properties({
        //     name : 'index', //资源文件名称
        //     path : 'i18n/' + i18nLanguage +'/', //资源文件路径
        //     mode : 'map', //用Map的方式使用资源文件中的值
        //     language : i18nLanguage,
        //     callback : function() {//加载成功后设置显示内容
        //         var insertEle = $(".i18n");
        //         console.log(".i18n 写入中...");
        //         insertEle.each(function() {
        //             // 根据i18n元素的 name 获取内容写入
        //             $(this).html($.i18n.prop($(this).attr('name')));
        //         });
        //         console.log("写入完毕");
        //
        //         console.log(".i18n-input 写入中...");
        //         var insertInputEle = $(".i18n-input");
        //         insertInputEle.each(function() {
        //             var selectAttr = $(this).attr('selectattr');
        //             if (!selectAttr) {
        //                 selectAttr = "value";
        //             };
        //             $(this).attr(selectAttr, $.i18n.prop($(this).attr('selectname')));
        //         });
        //         console.log("写入完毕");
        //     }
        // });
}

/*页面执行加载执行*/
$(function(){
    layer.config({
        title: $.i18n.prop('title'),
        skin: 'theme_trx',
        btn: $.i18n.prop('btninfo')
    })
    /*执行I18n翻译*/
    execI18n();
    /*将语言选择默认选中缓存中的值*/
    $("#language option[value="+i18nLanguage+"]").attr("selected",true);
    /* 选择语言 */
    $("#language").on('change', function() {
        var language = $(this).children('option:selected').val()
        console.log(language);
        getCookie("userLanguage",language);
        window.location.href='https://tronscan.io/'
        // location.reload();
    });
});