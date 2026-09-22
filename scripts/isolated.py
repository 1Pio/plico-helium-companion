#!/usr/bin/env python3
"""Only this project's marked test profile; no global native host registration."""
import argparse,base64,hashlib,json,os,pathlib,subprocess,sys
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
def launch():
 prepare()
 # Never attach to or restart the user's normal browser process.
 lines=subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines()
 if any(str(HELIUM) in line and '--user-data-dir='+str(PROFILE) in line for line in lines):raise SystemExit('Isolated Helium already running')
 pressure=int(subprocess.check_output(['sysctl','-n','kern.memorystatus_vm_pressure_level'],text=True))
 if pressure!=1:raise SystemExit('Memory pressure is not Normal')
 args=[str(HELIUM),'--user-data-dir='+str(PROFILE),'--load-extension='+str(ROOT/'extension'),'--no-first-run','--no-default-browser-check','--use-mock-keychain','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--enable-logging=stderr','https://example.com','https://example.org']
 with (LOCAL/'helium.log').open('a') as log:
  proc=subprocess.Popen(args,stdout=log,stderr=log,start_new_session=True)
 (LOCAL/'browser-pid.json').write_text(json.dumps({'pid':proc.pid,'profile':str(PROFILE)}))
 print('Launched isolated Helium PID',proc.pid)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('command',choices=['prepare','launch']);args=parser.parse_args()
 {'prepare':prepare,'launch':launch}[args.command]()
