import shutil, subprocess, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
@unittest.skipUnless(shutil.which('lua'),'Lua required')
class GenerationTest(unittest.TestCase):
 def preview(self, kind='ebgp', transit='0'):
  harness=r'''
local p={['.type']='peer',iface='dn42test',kind=KIND,asn='4242421000',public_key=string.rep('A',43)..'=',local_lla='fe80::1',remote_lla='fe80::2',zone='dn42',ipv4='1',ipv6='1',enabled='1',transit=TRANSIT,internal4={'192.168.2.0/24'},internal6={'fd00:1::/64'}}
local c={}
function c:get_all(config,name) return p end
function c:get(config,name,key) if config=='dn42' then if key=='bird_conf' then return '/etc/bird.conf' elseif key=='normal_template' then return 'dnpeers' elseif key=='transit_template' then return 'dnpeers_transit' end end return nil end
function c:foreach(config,typ,cb) if config=='firewall' then cb({name='dn42',['.name']='zone1'}) end end
package.preload['uci']=function()return {cursor=function()return c end}end
package.preload['luci.jsonc']=function()return {parse=function()return {name='peer1'}end,stringify=function(r)assert(r.ok,r.message);return r.message end}end
local open=io.open
io.open=function(path,mode) if path=='/etc/bird.conf' then return {read=function()return 'include "/etc/bird/peers/*.conf"; include "/etc/bird/ibgp/*.conf";' end,close=function()end} end return nil end
io.read=function()return '{}' end
io.popen=function(command)assert(command:find('uci changes',1,true),'Unexpected command: '..command);return {read=function()return '\n__DN42_EXIT_0\n' end,close=function()end}end
arg={'call','preview'}
dofile(SOURCE)
'''
  harness=harness.replace('KIND',repr(kind)).replace('TRANSIT',repr(transit)).replace('SOURCE',repr(str(ROOT/'root/usr/libexec/rpcd/luci.dn42')))
  r=subprocess.run(['lua','-'],input=harness,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr);return r.stdout
 def test_nontransit(self):
  s=self.preview();self.assertIn('from dnpeers {',s);self.assertIn('neighbor fe80::2%dn42test',s);self.assertIn('extended next hop on;',s)
 def test_transit(self):self.assertIn('from dnpeers_transit {',self.preview(transit='1'))
 def test_ibgp(self):
  s=self.preview(kind='ibgp');self.assertIn('local as OWNAS;',s);self.assertIn('192.168.2.0/24',s);self.assertIn('roa_check(dn42_roa_v6',s);self.assertNotIn(' from ',s)
if __name__=='__main__':unittest.main()
