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
if __name__=='__main__': unittest.main()
