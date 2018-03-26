
//var baseUrl = 'http://47.95.14.107:8088/';
//var baseUrl = 'http://192.168.10.195:8088/';
var baseUrl = 'http://192.168.10.55:8088/';




var transTrx = baseUrl+'sendCoinToView'; //转账接口
var transOther = baseUrl+'TransferAssetToView'; //资产转让

var anintran = baseUrl+'transactionFromView'; // 签名接口
var getAccountInfo = baseUrl +'queryAccount'; //查询账户详情
var accountList = baseUrl +'accountList'; //查询账户列表
var witnessList = baseUrl +'witnessList'; //查询出块人列表
var getBlockToView = baseUrl +'getBlockToView' ;//current block
var getBlockByNumToView = baseUrl +'getBlockByNumToView'; //recent block
var createAssetView = baseUrl + 'createAssetIssueToView'; //发行资产
var signView = baseUrl + 'transactionFromView'; //签名接口
var assetIssueListView = baseUrl + 'getAssetIssueList'; //资产列表
var createWitness = baseUrl + 'createWitnessToView'; //申请成为出块人
var participateAssetView = baseUrl + 'ParticipateAssetIssueToView'; //参与资产发行接口
var voteWitnessView = baseUrl + 'createVoteWitnessToView'; //投票接口

