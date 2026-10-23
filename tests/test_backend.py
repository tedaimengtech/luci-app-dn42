import shutil, subprocess, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
@unittest.skipUnless(shutil.which('lua'), 'Lua required')
class BackendTest(unittest.TestCase):
 def test_command_exit_status(self):
  source=(ROOT/'root/usr/libexec/rpcd/luci.dn42').read_text()
  start=source.index('local function run(');end=source.index('\nlocal function read(',start)
  script=source[start:end]+'''\nlocal a,ok=run("printf 'hello'; exit 0");assert(ok and a=='hello')\nlocal b,failed=run("printf 'broken'; exit 7");assert(not failed and b=='broken')\n'''
  r=subprocess.run(['lua','-'],input=script,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr)
 def test_identifiers_reject_injection(self):
  source=(ROOT/'root/usr/libexec/rpcd/luci.dn42').read_text()
  start=source.index('local function id(');end=source.index('\nlocal function list(',start)
  script=source[start:end]+'''\nassert(id('node2'));assert(not id('wg;reboot'));assert(not id('../peers'));assert(not id('abcdefghijklmnop'))\n'''
  r=subprocess.run(['lua','-'],input=script,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr)
 def test_shell_quoting(self):
  source=(ROOT/'root/usr/libexec/rpcd/luci.dn42').read_text()
  start=source.index('local function quote(');end=source.index('\nlocal function read(',start)
  script=source[start:end]+'''\nlocal text="literal ' $(printf WRONG) `printf WRONG`"\nlocal out,ok=run('printf %s '..quote(text));assert(ok and out==text)\n'''
  r=subprocess.run(['lua','-'],input=script,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr)
 def test_interface_routes_are_scoped_and_read_only(self):
  source=str(ROOT/'root/usr/libexec/rpcd/luci.dn42')
  script=r"""
local calls={}
package.preload['uci']=function()return {cursor=function()return {get_all=function()return {['.type']='peer',iface='tdmhome'}end}end}end
package.preload['luci.jsonc']=function()return {parse=function()return {name='tdmhome'}end,stringify=function(r)assert(r.ok,r.message);assert(r.ipv4:find('192.0.2.0/24',1,true));assert(r.ipv6:find('fd00::/48',1,true));return 'OK' end}end
io.read=function()return '{}' end
io.popen=function(command)
 calls[#calls+1]=command
 assert(command:find("route show table all dev 'tdmhome'",1,true),command)
 local text=command:find('ip -4',1,true) and '192.0.2.0/24 dev tdmhome' or 'fd00::/48 dev tdmhome'
 return {read=function()return text..'\n__DN42_EXIT_0\n' end,close=function()end}
end
arg={'call','interface_routes'}
dofile(SOURCE)
assert(#calls==2)
""".replace('SOURCE',repr(source))
  r=subprocess.run(['lua','-'],input=script,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr);self.assertIn('OK',r.stdout)
 def test_roa_launch_does_not_require_nohup(self):
  source=str(ROOT/'root/usr/libexec/rpcd/luci.dn42')
  script=r"""
local calls={}
package.preload['uci']=function()return {cursor=function()return {}end}end
package.preload['luci.jsonc']=function()return {parse=function()return {}end,stringify=function(r)assert(r.ok,r.message);return r.message end}end
io.read=function()return '{}' end
io.popen=function(command)
 calls[#calls+1]=command
 assert(not command:find('nohup',1,true))
 return {read=function()return '\n__DN42_EXIT_0\n' end,close=function()end}
end
arg={'call','roa'}
dofile(SOURCE)
assert(#calls==5)
assert(calls[3]:find('test -x /usr/libexec/dn42/update-roa',1,true))
assert(calls[4]:find('trap "" HUP; exec /usr/libexec/dn42/update-roa',1,true))
assert(calls[4]:find('2>&1 < /dev/null &',1,true))
""".replace('SOURCE',repr(source))
  r=subprocess.run(['lua','-'],input=script,text=True,capture_output=True);self.assertEqual(r.returncode,0,r.stderr)
if __name__=='__main__': unittest.main()
