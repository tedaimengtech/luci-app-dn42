'use strict';
'require view';
'require form';
'require rpc';
'require ui';
var commit=rpc.declare({object:'uci',method:'commit',params:['config']});
var update=rpc.declare({object:'luci.dn42',method:'roa'});
var schedule=rpc.declare({object:'luci.dn42',method:'schedule'});
return view.extend({render:function(){
 var m=new form.Map('dn42','ROA 与已有 BIRD 模板','沿用 /etc/bird 的文件结构。自动任务每小时运行一次；已有 update-roa.sh 保留，重复任务需要先处理。');
 var s=m.section(form.NamedSection,'settings','global');
 ['bird_conf','normal_template','transit_template','roa4_url','roa6_url'].forEach(function(k){s.option(form.Value,k,({bird_conf:'主配置路径',normal_template:'非 transit 模板',transit_template:'transit 模板',roa4_url:'IPv4 HTTPS 来源',roa6_url:'IPv6 HTTPS 来源'})[k]);});
 s.option(form.Flag,'roa_auto','每小时自动更新');var o=s.option(form.Value,'roa_minute','每小时第几分钟');o.datatype='range(0,59)';
 o=s.option(form.Button,'schedule','应用定时设置');o.onclick=function(){return m.save().then(function(){return commit('dn42');}).then(schedule).then(function(r){ui.addNotification(null,E('pre',{},r.message));});};
 o=s.option(form.Button,'update','立即更新');o.onclick=function(){return m.save().then(function(){return commit('dn42');}).then(update).then(function(r){ui.addNotification(null,E('pre',{},r.message),r.ok?'info':'error');});};
 return Promise.resolve(m.render()).then(function(node){return E('div',{class:'dn42-page'},[E('link',{rel:'stylesheet',href:L.resource('dn42/style.css')}),node]);});
}});
