#!/usr/bin/env python3
"""Only this project's marked test profile; no global native host registration."""
import argparse,base64,hashlib,json,os,pathlib,subprocess,sys,shutil,re,plistlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
LOCAL=ROOT/'.local'; PROFILE=LOCAL/'helium-profile'
APP=ROOT/'build/Plico Helium Companion.app'
HOST=APP/'Contents/MacOS/plico-companion'
HELIUM=pathlib.Path('/Applications/Helium.app/Contents/MacOS/Helium')
def extension_id():
 m=json.loads((ROOT/'extension/manifest.json').read_text())
 return ''.join(chr(97+int(c,16)) for c in hashlib.sha256(base64.b64decode(m['key'])).hexdigest()[:32])
def prepare():
 if PROFILE.exists() and not (PROFILE/'.plico-isolated').exists():raise SystemExit('Refusing unmarked existing profile')
 PROFILE.mkdir(parents=True,exist_ok=True);(PROFILE/'.plico-isolated').touch()
 if not HOST.is_file():raise SystemExit('Build the companion first')
 folder=PROFILE/'NativeMessagingHosts';folder.mkdir(exist_ok=True)
 manifest={'name':'cc.helwig.plico.companion','description':'Plico isolated native companion','path':str(HOST),'type':'stdio','allowed_origins':['chrome-extension://'+extension_id()+'/']}
 (folder/'cc.helwig.plico.companion.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'profile':str(PROFILE),'app':str(APP),'extension_id':extension_id()}))
def qualification_extension():
 folder=LOCAL/'qualification-extension';folder.mkdir(exist_ok=True)
 for source in (ROOT/'extension').iterdir():
  if source.is_file():shutil.copy2(source,folder/source.name)
 manifest=json.loads((folder/'manifest.json').read_text())
 manifest['background']['service_worker']='qualification-worker.mjs'
 (folder/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (folder/'qualification-worker.mjs').write_text("import * as bridge from './background.mjs'; globalThis.__plicoQualification=bridge;\n")
 return folder

def launch(qualify=False,restore=False):
 prepare()
 # Never attach to or restart the user's normal browser process.
 lines=subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines()
 if any('--user-data-dir='+str(PROFILE) in line for line in lines):raise SystemExit('Isolated Helium already running')
 pressure=int(subprocess.check_output(['sysctl','-n','kern.memorystatus_vm_pressure_level'],text=True))
 if pressure!=1:raise SystemExit('Memory pressure is not Normal')
 extension=qualification_extension() if qualify else ROOT/'extension'
 args=[str(HELIUM),'--user-data-dir='+str(PROFILE),'--load-extension='+str(extension),'--no-first-run','--no-default-browser-check','--use-mock-keychain','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--enable-logging=stderr']
 args+=['--restore-last-session'] if restore else ['https://example.com','https://example.org']
 with (LOCAL/'helium.log').open('a') as log:
  env=os.environ.copy();env['PLICO_DIAGNOSTICS']='1'
  proc=subprocess.Popen(args,stdout=log,stderr=log,start_new_session=True,env=env)
 (LOCAL/'browser-pid.json').write_text(json.dumps({'pid':proc.pid,'profile':str(PROFILE),'browser_executable':str(HELIUM)}))
 print('Launched isolated Helium PID',proc.pid)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','launch']);parser.add_argument('--qualify-bridge',action='store_true');parser.add_argument('--restore-session',action='store_true');parser.add_argument('--browser-version');args=parser.parse_args()
 if args.browser_version:
  if not args.qualify_bridge or not re.fullmatch(r'\d+(?:\.\d+){3}',args.browser_version):raise SystemExit('Rehearsal version requires qualification profile')
  folder=LOCAL/'update-rehearsal';app=folder/args.browser_version/'Helium.app'
  if not (folder/'.plico-rehearsal').is_file() or app.resolve()!=app:raise SystemExit('Unmarked or linked rehearsal app')
  info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
  if info.get('CFBundleIdentifier')!='net.imput.helium' or info.get('CFBundleShortVersionString')!=args.browser_version:raise SystemExit('Rehearsal app identity mismatch')
  subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
  HELIUM=app/'Contents/MacOS/Helium'
 if args.qualify_bridge:PROFILE=LOCAL/'helium-qualification-profile'
 prepare() if args.command=='prepare' else launch(args.qualify_bridge,args.restore_session)
