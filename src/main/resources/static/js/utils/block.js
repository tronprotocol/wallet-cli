

$(function () {

});


ajaxRequest( "GET",getBlockToView,data,TransSuccessCallback,TransFailureCallback);

var data ={

};

TransSuccessCallback = function (data) {
  console.log(data)
};

TransFailureCallback = function (err) {
  console.log('err')
};