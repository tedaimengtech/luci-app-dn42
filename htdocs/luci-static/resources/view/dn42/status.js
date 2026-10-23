'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';
var status=rpc.declare({object:'luci.dn42',method:'status'});
var route=rpc.declare({object:'luci.dn42',method:'route',params:['prefix']});
var diagnose=rpc.declare({object:'luci.dn42',method:'diagnose',params:['name']});
var detail=rpc.declare({object:'luci.dn42',method:'detail',params:['name']});
var action=rpc.declare({object:'luci.dn42',method:'action',params:['name','operation']});
return view.extend({handleSave:null,handleSaveApply:null,handleReset:null,
 render:function(){
 var box=E('div');var search=E('input',{placeholder:'172.20.0.0/24 或 fd00::/48'});var result=E('pre');var wrapper=E('div',{},[E('h3',{},'路由查询'),search,E('button',{class:'btn',click:function(){route(search.value).then(function(r){dom.content(result,r.message);});}},'查询'),result,box]);
 function refresh(){return status().then(function(r){
 var groups={};(r.peers||[]).forEach(function(p){(groups[p.asn]||(groups[p.asn]=[])).push(p);});
 var content=[E('h2',{},'DN42 状态'),E('p',{},'握手时间仅反映最近活动，不等同于连接存活状态。'),E('pre',{},r.protocols||'BIRD 无响应'),E('h3',{},'ROA 最近成功结果'),E('pre',{},r.roa),E('pre',{},r.roa_log)];
 Object.keys(groups).sort().forEach(function(asn){content.push(E('h3',{},'AS'+asn));groups[asn].forEach(function(p){
 content.push(E('div',{class:'cbi-section'},[E('strong',{},(p.label||p.name)+' · '+p.iface),E('pre',{},p.wg||'WireGuard 接口未运行'),E('button',{class:'btn',click:function(){detail(p.name).then(function(d){ui.showModal(p.label||p.name,[E('pre',{style:'max-height:65vh;overflow:auto'},d.bgp+'\n'+d.wg),E('button',{class:'btn',click:ui.hideModal},'关闭')]);});}},'BGP / WG 详情'),E('button',{class:'btn',click:function(){diagnose(p.name).then(function(r){ui.showModal('LLA 诊断',[E('pre',{},r.message),E('button',{class:'btn',click:ui.hideModal},'关闭')]);});}},'诊断'),E('button',{class:'btn',click:function(){action(p.name,'disable').then(refresh);}},'停用 BGP'),E('button',{class:'btn',click:function(){action(p.name,'enable').then(refresh);}},'启用 BGP'),E('button',{class:'btn',click:function(){action(p.name,'reload').then(function(r){ui.addNotification(null,E('pre',{},r.message));});}},'重载导入') ]));});});
 dom.content(box,content);
 });}
 poll.add(refresh,10);refresh();return wrapper;
 }
});
