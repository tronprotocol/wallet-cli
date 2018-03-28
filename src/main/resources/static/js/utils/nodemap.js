var nodeMapData;
var nodemap = $('#nodemap');
var map = window.map = echarts.init(nodemap.get(0));
var smallNodes = [], midiumNodes = [], largeNodes = [], allNodes = [];
var sizes = [
    {
        minimumCount: 50,
        symbolSize: 23
    },
    {
        minimumCount: 10,
        symbolSize: 18
    },
    {
        minimumCount: 3,
        symbolSize: 13
    },
    {
        minimumCount: 1,
        symbolSize: 8
    },
];
updateMap();
updateNodes();
function updateNodes() {
	
//	var nodeUrl = "http://192.168.10.55:8088/nodeList";
	var nodeUrl = nodeMapDots;
	
	var cityObj = {
		'China':0,
		'United States':0,
		'Germany':0,
		'Hong Kong':0,
	};
	var cityArr = [
		{
			'name':'China',
			'count':0,
		},{
			'name':'Hong Kong',
			'count':0,
		},{
			'name':'United States',
			'count':0,
		},{
			'name':'Germany',
			'count':0,
		}
	];
	var num1 = 0;
	var num2 = 0;
	var num3 = 0;
	var num4 = 0;
	var flag = 0;
	var totalNum = 0;
	//获取Map节点数据
    $.ajax({
    	 	type: "get",
        url: nodeUrl,
        data: "",
        success: function(data) {
        		data = JSON.parse(data);
        		nodeMapData = data.citys;
            allNodes = data.citys;
            console.log('all ',nodeMapData);
			for(var i=0;i<nodeMapData.length;i++){
				if(nodeMapData[i].country == 'China'){
					num1 = cityObj['China'];
					num1 = num1 + nodeMapData[i].count;
					cityObj['China'] = num1;
				}else if(nodeMapData[i].country == 'Hong Kong'){
					num2 = cityObj['Hong Kong'];
					num2 = num2 + nodeMapData[i].count;
					cityObj['Hong Kong'] = num2;
				}else if(nodeMapData[i].country == 'United States'){
					num3 = cityObj['United States'];
					num3 = num3 + nodeMapData[i].count;
					cityObj['United States'] = num3;
				}else if(nodeMapData[i].country == 'Germany'){
					num4 = cityObj['Germany'];
					num4 = num4 + nodeMapData[i].count;
					cityObj['Germany'] = num4;
				}else{
					
				}
			}
			for(var i=0;i<nodeMapData.length;i++){
				if(nodeMapData[i].country == 'China'){
					num1 = cityArr[0].count;
					num1 = num1 + nodeMapData[i].count;
					cityArr[0].count = num1;
				}else if(nodeMapData[i].country == 'Hong Kong'){
					num2 = cityArr[1].count;
					num2 = num2 + nodeMapData[i].count;
					cityArr[1].count = num2;
				}else if(nodeMapData[i].country == 'United States'){
					num3 = cityArr[2].count;
					num3 = num3 + nodeMapData[i].count;
					cityArr[2].count = num3;
				}else if(nodeMapData[i].country == 'Germany'){
					num4 = cityArr[3].count;
					num4 = num4 + nodeMapData[i].count;
					cityArr[3].count = num4;
				}else{
					
				}
			}
			console.log('end',cityObj);
			cityArr.sort(compare("count"));
			console.log('end3333',cityArr);
//			for(var i in cityObj){
//				flag++;
//				$('.map_left_list').append('<li class="map_list_li"><span class="map_list_li_item map_nav_left"><i>'+flag+'</i></span><span class="map_list_li_item map_nav_middle">'+i+'</span><span class="map_list_li_item map_nav_right">'+cityObj[i]+'</span></li>');
//				totalNum += cityObj[i];
//			}
			for(var i in cityArr){
				$('.map_left_list').append('<li class="map_list_li"><span class="map_list_li_item map_nav_left"><i>'+i+'</i></span><span class="map_list_li_item map_nav_middle">'+cityArr[i].name+'</span><span class="map_list_li_item map_nav_right">'+cityArr[i].count+'</span></li>');
				totalNum += cityArr[i].count;
			}
			$('.map_left_title').find('span').html(totalNum);
            updateMap();
        },
        error: function(e){
        		console.error('eee',e);
        }
    });
}

//定义一个比较器
  function compare(propertyName) {
    return function(object1, object2) {
      var value1 = object1[propertyName];
      var value2 = object2[propertyName];
      if (value2 > value1) {
        return 1;
      } else if (value2 < value1) {
        return -1;
      } else {
        return 0;
      }
    }
  }
function updateMap() {
    var length = sizes.length;
    var nodes = new Array(length);
    var byCountryNodes = {};
    var totalCount = 0;
    var i;
    allNodes.forEach(function(data, index) {
        var temp = [];
        node = [data.longitude, data.latitude, data.count, data.city, data.province, data.country];
        for (i = 0; i < length; i++) {
            if (data.count >= sizes[i].minimumCount) {
                if (!nodes[i]) {
                    nodes[i] = [];
                }
                nodes[i].push(node);
                break;
            }
        }
        if (!byCountryNodes[data.country]) {
            byCountryNodes[data.country] = data;
        } else {
            byCountryNodes[data.country].count += data.count;
        }
        totalCount += data.count;
    });
    
    var unknown = byCountryNodes[''];
    delete byCountryNodes['']
    byCountryNodes = Object.values(byCountryNodes).sort(function(a, b) {
        return b.count - a.count;
    });
    if (unknown) {
        unknown.country = 'Unknown';
        byCountryNodes.push(unknown);
    }
    var series = sizes.map(function(size, index) {
        return {
            type: 'effectScatter',
            coordinateSystem: 'geo',
            data: nodes[index],
            symbolSize: size.symbolSize,
            showEffectOn: 'render',
            rippleEffect: {
                scale: 3,
                brushType: 'stroke'
            },
            label: {
                normal: {
                    show: false
                },
                emphasis: {
                    show: false
                }
            },
            itemStyle: {
                normal: {
//                  color: '#e75647'
                    color: '#E70B18'
                }
            }
        }
    });
    map.setOption({
        tooltip: {
            formatter: function(param) {
                var data = param.data;
                var location = [data[3], data[5]];
                return [
                    location.filter(function(value) {
                        return value != '';
                    }).join(', '),
                    'Count: ' + data[2]
                ].join('<br>');
            }
        },
        geo: {
            map: 'world',
            left: 0,
            right: 0,
            silent: true,
            roam: true,
            itemStyle: {
                normal: {
                    // borderColor: '#003',
					color: '#D0D0D0',
					borderColor:'#D0D0D0'
                }
            }
        },
        series: series
    });
    //update info
    if (totalCount > 0) {
        var template = $($('#nodeinfo--template').html());
        var ul = template.filter('ul');
        var rankTemplate = template.find('.nodeinfo--rankitem');
        template.find('.nodeinfo--count').text(totalCount);
        template.find('.nodeinfo--rankitem').remove();
        byCountryNodes.forEach(function(node, i) {
            var rank = rankTemplate.clone().appendTo(ul);
            rank.find('.rank').text(i + 1);
            rank.find('.country').text(node.country);
            rank.find('.nodes').text(node.count);
            if (i >= 10) {
                rank.addClass('hide')
            }
        })
        if (byCountryNodes.length > 10) {
            var more = $('<li class="more"/>').text('more>>').click(function() {
                ul.find('li.hide').removeClass('hide');
                more.addClass('hide')
            }).appendTo(ul);
            var less = $('<li class="more hide"/>').text('<<less').click(function() {
                ul.find('li.hide').removeClass('hide');
                ul.find('li.nodeinfo--rankitem:gt(9)').addClass('hide');
                less.addClass('hide')
            }).appendTo(ul);
        }
        $('.nodeinfo').html(template);
    }
}


