'use strict';
'require view';
'require rpc';
'require ui';
'require dom';
'require dn42.status as parse';
var status=rpc.declare({object:'luci.dn42',method:'status'});
var interfaceRoutes=rpc.declare({object:'luci.dn42',method:'interface_routes',params:['name']});
var route=rpc.declare({object:'luci.dn42',method:'route',params:['prefix']});
var diagnose=rpc.declare({object:'luci.dn42',method:'diagnose',params:['name']});
var detail=rpc.declare({object:'luci.dn42',method:'detail',params:['name']});
var action=rpc.declare({object:'luci.dn42',method:'action',params:['name','operation']});
var labels={'BGP state':'会话状态','Neighbor address':'远端地址','Neighbor AS':'远端 ASN','Local AS':'本地 ASN','Neighbor ID':'远端 Router ID','Session':'会话能力','Source address':'本地地址','Last error':'最近错误','State':'通道状态','Table':'路由表','Preference':'优先级','Input filter':'导入过滤器','Output filter':'导出过滤器','Routes':'路由统计','BGP Next hop':'BGP 下一跳','IGP IPv4 table':'IPv4 下一跳查询表','IGP IPv6 table':'IPv6 下一跳查询表'};
function table(headers,rows){return E('table',{class:'table'},[E('tr',{class:'tr table-titles'},headers.map(function(h){return E('th',{class:'th'},h);} ))].concat(rows.map(function(row){return E('tr',{class:'tr'},row.map(function(cell){return E('td',{class:'td',style:'overflow-wrap:anywhere'},cell);}));})));}
function fields(rows){return table(['项目','内容'],rows.map(function(r){return [labels[r[0]]||r[0],r[1]||'—'];}));}
function raw(title,text){return E('details',{},[E('summary',{},title),E('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere'},text||'无输出')]);}
function assertResult(r){if(!r||r.ok===false)throw new Error(r&&r.message||'状态接口没有返回数据');return r;}
return view.extend({handleSave:null,handleSaveApply:null,handleReset:null,
 render:function(){
 var box=E('div'),notice=E('div'),selected=null,last=null,version=0;
 var initial=window.location.hash.match(/^#connection=([a-zA-Z][a-zA-Z0-9_]*)$/);if(initial)selected=initial[1];
 function error(e){dom.content(notice,E('div',{class:'alert-message warning'},'刷新失败：'+e.message));}
 function navigate(name){selected=name;window.location.hash=name?'connection='+name:'';if(last)draw(last);}
 function command(name,operation){return action(name,operation).then(assertResult).then(refresh).catch(error);}
 function diagnostic(name){return diagnose(name).then(assertResult).then(function(r){ui.showModal('LLA 诊断',[raw('诊断输出',r.message),E('button',{class:'btn',click:ui.hideModal},'关闭')]);}).catch(error);}
 function draw(r){
  var ticket=++version,peers=Array.isArray(r.peers)?r.peers:[],sessions=parse.protocols(r.protocols);
  var p=peers.filter(function(p){return p.name===selected;})[0];
  if(selected&&!p){selected=null;window.location.hash='';}
  var content=[E('h2',{},p?(p.label||p.name)+' · '+p.iface:'DN42 状态'),E('button',{class:'btn',click:refresh},'刷新状态')];
  if(p){
   content.push(E('button',{class:'btn',click:function(){navigate(null);}},'返回连接列表'));
   content.push(E('p',{},'AS'+p.asn+' · BGP 协议 dn42_'+p.name+' · 手动刷新'));
   var panel=E('div',{},'正在读取连接状态…');content.push(panel);dom.content(box,content);
   return detail(p.name).then(assertResult).then(function(d){
    if(ticket!==version)return;
    var b=parse.bgp(d.bgp),w=parse.wireguard(d.wg),session=b.sessions[0];
    var nodes=[E('h3',{},'连接配置'),fields([['类型',p.kind==='ibgp'?'iBGP':p.kind==='ebgp'?'eBGP':'未知'],['IPv4',p.ipv4==='1'?'启用':'禁用'],['IPv6',p.ipv6==='1'?'启用':'禁用'],['Transit',p.kind==='ibgp'?'不适用（iBGP）':p.transit==='1'?'使用 transit 模板':'未使用 transit 模板'],['BIRD 模板',p.template||'不使用模板'],['RR 客户端',p.rr_client==='1'?'是':'否'],['防火墙区域',p.zone||'未设置'],['外层 UDP 入站区域',p.listen_zone||'不自动放行']]),E('h3',{},'BGP'),fields([['BGP state',session?(session.info||session.state):'未找到会话'],['协议名称','dn42_'+p.name],['状态开始时间',session?session.since:'—']].concat(b.fields))];
    b.channels.forEach(function(c){nodes.push(E('h4',{},c.name),fields(c.fields));});
    nodes.push(raw('BIRD 原始输出',d.bgp),E('h3',{},'WireGuard'));
    if(w.iface){
     nodes.push(fields([['接口',w.iface],['本地公钥',w.public_key],['监听端口',w.listening_port]]));
     w.peers.forEach(function(wp,i){nodes.push(E('h4',{},'远端 '+(i+1)),fields([['远端公钥',wp.public_key],['Endpoint',wp.endpoint],['AllowedIPs',wp.allowed_ips],['最近握手',wp.latest_handshake||'尚无握手记录'],['收发流量',wp.transfer],['Keepalive',wp.persistent_keepalive]]));});
     if(!w.peers.length)nodes.push(E('p',{},'接口没有配置远端。'));
    }else nodes.push(E('p',{},'WireGuard 接口不可用，请检查原始输出。'));
    nodes.push(E('p',{},'最近握手仅表示上次活动时间；BGP Established 表示路由会话已建立。'),raw('WireGuard 原始输出',d.wg));
    var routePanel=E('div',{},'点击查询，显示内核路由表中经过 '+p.iface+' 的路由。');
    nodes.push(E('h3',{},'经过此接口的路由'),E('p',{},'查询 IPv4 / IPv6 的全部内核路由表，包括静态、BGP 下发及本地路由。结果按出接口筛选；策略路由仍取决于规则和流量条件。'),E('button',{class:'btn',click:function(){
     dom.content(routePanel,'正在查询…');
     return interfaceRoutes(p.name).then(assertResult).then(function(r){
      var sections=[];
      ['ipv4','ipv6'].forEach(function(af){var rows=parse.routes(r[af]);sections.push(E('h4',{},(af==='ipv4'?'IPv4':'IPv6')+' · '+rows.length+' 条'),rows.length?table(['目标前缀','下一跳','路由表','Metric','类型'],rows.map(function(row){return [row.prefix,row.gateway,row.table,row.metric,row.type];})):E('p',{},'暂无经过该接口的路由。'),raw('原始路由输出',r[af]));});
      dom.content(routePanel,sections);
     }).catch(function(e){dom.content(routePanel,E('div',{class:'alert-message warning'},e.message));});
    }},'查询接口路由'),routePanel);
    nodes.push(E('div',{class:'cbi-page-actions'},[E('button',{class:'btn',click:function(){return diagnostic(p.name);}},'LLA 诊断'),E('button',{class:'btn',click:function(){return command(p.name,'enable');}},'启用 BGP'),E('button',{class:'btn',click:function(){return command(p.name,'disable');}},'停用 BGP'),E('button',{class:'btn',click:function(){return command(p.name,'reload');}},'重载导入')]));
    dom.content(panel,nodes);
   }).catch(function(e){if(ticket===version)dom.content(panel,E('div',{class:'alert-message warning'},e.message));});
  }
  content.push(E('p',{},'点击连接名称查看 BGP、WireGuard 与接口路由。状态仅手动刷新。'));
  content.push(table(['连接','远端 ASN','接口','类型 / 地址族','Transit','防火墙区域','BGP 状态','最近握手','收发流量'],peers.map(function(p){
   var b=sessions.filter(function(s){return s.name==='dn42_'+p.name;})[0],w=parse.wireguard(p.wg),wp=w.peers[0]||{};
   return [E('a',{href:'#connection='+p.name,click:function(ev){ev.preventDefault();navigate(p.name);}},p.label||p.name),'AS'+p.asn,p.iface,(p.kind==='ibgp'?'iBGP':p.kind==='ebgp'?'eBGP':'未知')+' / '+([p.ipv4==='1'?'IPv4':'',p.ipv6==='1'?'IPv6':''].filter(Boolean).join(' + ')||'未启用'),p.kind==='ibgp'?'—':p.transit==='1'?'是':'否',p.zone||'未设置',b?(b.info||b.state):'未找到会话',wp.latest_handshake||(w.iface?'尚无握手记录':'接口不可用'),wp.transfer||'—'];
  })));
  if(!peers.length)content.push(E('p',{},'暂无插件管理的连接，请在“连接”页添加。'));
  var unmanaged=sessions.filter(function(s){return !peers.some(function(p){return s.name==='dn42_'+p.name;});});
  if(unmanaged.length)content.push(E('h3',{},'其他 BGP 会话'),table(['协议','状态','状态开始时间'],unmanaged.map(function(s){return [s.name,s.info||s.state,s.since];})),E('p',{},'手工会话尚未关联 WireGuard 接口。'));
  content.push(raw('BIRD 协议概况',r.protocols),E('h3',{},'ROA 最近成功结果'),E('p',{},r.roa||'尚无更新记录'));
  if(r.roa_log&&r.roa_log.trim())content.push(raw('ROA 更新日志',r.roa_log));
  dom.content(box,content);
 }
 function refresh(){return status().then(assertResult).then(function(r){last=r;dom.content(notice,[]);return draw(r);}).catch(error);}
 var search=E('input',{placeholder:'172.20.0.0/24 或 fd00::/48'}),result=E('pre',{style:'white-space:pre-wrap'});
 var wrapper=E('div',{},[notice,box,E('details',{},[E('summary',{},'路由查询'),search,E('button',{class:'btn',click:function(){return route(search.value).then(assertResult).then(function(r){dom.content(result,r.message);}).catch(error);}},'查询'),result])]);
 var hashHandler=function(){var m=window.location.hash.match(/^#connection=([a-zA-Z][a-zA-Z0-9_]*)$/),name=m?m[1]:null;if(name!==selected){selected=name;if(last)draw(last);}};
 window.addEventListener('hashchange',hashHandler);
 window.addEventListener('pagehide',function(){window.removeEventListener('hashchange',hashHandler);},{once:true});
 refresh();return wrapper;
 }
});
