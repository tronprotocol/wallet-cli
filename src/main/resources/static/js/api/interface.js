
var baseUrl = '/';
//var baseUrl = 'http://47.95.14.107:8088/';
//var baseUrl = 'http://192.168.10.55:8088/';
//var baseUrl = 'http://localhost:8088/';

var transTrx = baseUrl+'sendCoinToView'; //转账接口
var transOther = baseUrl+'TransferAssetToView'; //通证转让
var anintran = baseUrl+'transactionFromView'; // 签名接口
var getAccountInfo = baseUrl +'queryAccount'; //查询账户详情
var accountList = baseUrl +'accountList'; //查询账户列表
var witnessList = baseUrl +'witnessList'; //查询出块人列表
var getBlockToView = baseUrl +'getBlockToView' ;//current block
var getBlockByNumToView = baseUrl +'getBlockByNumToView'; //recent block
var createAssetView = baseUrl + 'createAssetIssueToView'; //发行通证
var signView = baseUrl + 'transactionFromView'; //签名接口
var assetIssueListView = baseUrl + 'getAssetIssueList'; //通证列表
var createWitness = baseUrl + 'createWitnessToView'; //申请成为出块人
var participateAssetView = baseUrl + 'ParticipateAssetIssueToView'; //参与通证发行接口
var voteWitnessView = baseUrl + 'createVoteWitnessToView'; //投票接口
var getAssetByNameView = baseUrl + 'getAssetIssueByName'; //根据通证名字获取通证信息
var nodeMapDots = baseUrl + 'nodeList'; //节点地图里的位置
var getTotalTrans = baseUrl + 'getTotalTransaction'; //交易量

