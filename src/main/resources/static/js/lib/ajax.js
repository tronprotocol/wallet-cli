/** @brief  封装ajax请求 create by zsj 2018-03-19
 *  @param  targetUrl     请求接口
 *  @param  requestData        请求接口传参
 *  @param  successCallback     回调方法
 *  @param  failureCallback     失败方法
 */
ajaxRequest = function (typeIn, targetUrl, requestData, successCallback, failureCallback) {
    $.ajax({
        type: typeIn,
        url: targetUrl,
        data: requestData,
        success: function (msg) {
            successCallback(msg);
        },
        error: function (msg) {
            failureCallback(msg);
        }
    });
};

/**
 * subStrData   处理时间
 * @param str   传入的时间字段 string
 * @param type  data、time   string
 * @returns data    所期望的日期格式
 * @returns time    所期望的时间格式
 * @returns null    没合法之返回Null
 */
subStrData = function (str, type) {
    type = type || "";
    if (str) {
        var strAry = str.split(" ");
        if (strAry[0].indexOf("-") > 0) {
            var tempDataStr = strAry[0].split("-");// 年月日
        } else if (strAry[0].indexOf("/") > 0) {
            var tempDataStr = strAry[0].split("/");
        } else {
            var tempDataStr = strAry[0].split(" ");
        }
        // 判断日期格式
        switch (type.toLowerCase()) {
            case "yyyy":
                return strAry[0].substr(0, 4);
                break;
            case "yyyy-mm-dd":
                return strAry[0].substr(0, 4) + "-" + strAry[0].substr(5, 2) + "-" + strAry[0].substr(8, 2);
                break;
            case "yyyy-m-d":
                return strAry[0].substr(0, 4) + "-" +
                    (strAry[0].substr(5, 1) == 0 ? strAry[0].substr(6, 1) : strAry[0].substr(5, 2)) + "-" +
                    (strAry[0].substr(8, 1) == 0 ? strAry[0].substr(9, 1) : strAry[0].substr(8, 2));
                break;
            case "yyyy/mm/dd":
                return strAry[0].substr(0, 4) + "/" + strAry[0].substr(5, 2) + "/" + strAry[0].substr(8, 2);
                break;
            case "mm-dd":
                return strAry[0].substr(5, 2) + "-" + strAry[0].substr(8, 2);
                break;
            case "mm/dd":
                return strAry[0].substr(5, 2) + "/" + strAry[0].substr(8, 2);
                break;
            case "m.d":
                return (strAry[0].substr(5, 1) == 0 ? strAry[0].substr(6, 1) : strAry[0].substr(5, 2)) + "." +
                    (strAry[0].substr(8, 1) == 0 ? strAry[0].substr(9, 1) : strAry[0].substr(8, 2));
                break;
            case "hhmm":
                return strAry[strAry.length - 1].substr(0, 5);
                break;
        }
    }
    return str;
};