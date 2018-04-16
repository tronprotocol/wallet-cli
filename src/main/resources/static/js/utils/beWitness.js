$(document).ready(function(){
    //btn 是否可点击
    $(".c_check input").on("click", function () {
        if ($(this).is(":checked")) {
            if($('.ord_input').val() != ''){
                $('#tobeWitness').removeClass('disable_btn')
            } else {
                $('#tobeWitness').addClass('disable_btn')
            }
        }else{
            $('#tobeWitness').addClass('disable_btn')
        }
    })
    $('.ord_input').on('blur',function(){
        if($('.ord_input').val() != ''){
            if ($(".c_check input").is(":checked")) {
                $('#tobeWitness').removeClass('disable_btn')
            }else {
                $('#tobeWitness').addClass('disable_btn')
            }
        }else{
            $('#tobeWitness').addClass('disable_btn')
        }
    })

    $('#tobeWitness').on('click',function () {
        if(!$(".c_check input").is(":checked")){
            layer.alert($.i18n.prop('layer.announcement'))
        }else if($('.ord_input').val() == ''){
            layer.alert($.i18n.prop('layer.delegatewebsite'))
        }else{
            createWitnessView()
        }
    })

    function createWitnessSuccess(data) {
        console.log(data)
        var transaction = getTransActionFromBase64String(data);
        var transactionSigned = signTransaction(com_priKeyBytes, transaction);
        var transactionBytes = transactionSigned.serializeBinary();
        var transactionString = byteArray2hexStr(transactionBytes);
        var para = "transactionData=" + transactionString;

        ajaxRequest("POST", anintran, para, TransBroadSuccessCallback,
            TransBroadFailureCallback)

    }
    function createWitnessFail(error) {
        console.log(error)
    }
    createWitnessView =function() {
        var com_pri = window.localStorage.getItem('key');
        var onwerUrl = $('.ord_input').val();
        com_priKeyBytes = base64DecodeFromString(com_pri);
        var com_addressBytes = getAddressFromPriKey(com_priKeyBytes);
        var com_text = getBase58CheckAddress(com_addressBytes);
        console.log(com_text)
        ajaxRequest( "post",createWitness,{'address':com_text,'onwerUrl':onwerUrl},createWitnessSuccess,createWitnessFail)
    }
     //验签成功
     function TransBroadSuccessCallback(data) {
            if(data){
                layer.alert($.i18n.prop('layer.applysuccess'));
                $('#tobeWitness').css('display','none')
                $('.ord_suc').css('display','block')
            }else{
                layer.alert($.i18n.prop('layer.applyfail'));
            }


     };

    function TransBroadFailureCallback(data) {
        console.log(data)
    }





});