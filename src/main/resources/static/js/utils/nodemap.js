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
                var data = JSON.parse(data);
        		var nodes = data.citys;
                allNodes =  data.citys;
                console.log('allNodes',allNodes)
                var newNodes = [];
                var sameNodes = [];
                var total = 0
                $.each(nodes,function(i,v){
                    var flag = true;
                    if(newNodes.length > 0){

                        $.each(newNodes,function(n,m){
                            if(newNodes[n].country == nodes[i].country){
                                flag = false;
                                console.log('newNodes[n].country',newNodes[n].country,newNodes[n].count,nodes[i].city,nodes[i].count)
                                newNodes[n].count += nodes[i].count

                            };
                        });
                    };
                    if(flag){
                        newNodes.push(nodes[i]);
                    }
                });
                $.each(newNodes,function(i,v){
                    total += newNodes[i].count
                });

            if(newNodes.length>10){
               $('.map-left-more').css('display','block')
               $('.map-left-more').on('click',function () {
                   $('.map_left_list').css('height','auto')
                   $(this).css('display','none')
               })
            }
            var countries =  _.sortBy(newNodes, [function(o) { return o.count; }]);
            countries.reverse();
            console.log('countries',countries);
//			for(var i in cityObj){
//				flag++;
//				$('.map_left_list').append('<li class="map_list_li"><span class="map_list_li_item map_nav_left"><i>'+flag+'</i></span><span class="map_list_li_item map_nav_middle">'+i+'</span><span class="map_list_li_item map_nav_right">'+cityObj[i]+'</span></li>');
//				totalNum += cityObj[i];
//			}
//             $('.map_left_list').html('');
			for(var i in countries){
				$('.map_left_list').append('<li class="map_list_li"><span class="map_list_li_item map_nav_left"><i>'+(Number(i)+1)+'</i></span><span class="map_list_li_item map_nav_middle">'+countries[i].country+'</span><span class="map_list_li_item map_nav_right">'+countries[i].count+'</span></li>');
			}
			$('.map_left_title').find('span').html(total);

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


