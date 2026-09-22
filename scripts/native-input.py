#!/usr/bin/env python3
"""Explicitly authorized native qualification, never an everyday browser PID."""
import json,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parent.parent
state=json.loads((root/'.local/browser-pid.json').read_text());profile=pathlib.Path(state['profile'])
if profile.parent!=root/'.local' or not (profile/'.plico-isolated').is_file():raise SystemExit('Unmarked profile')
command=subprocess.check_output(['ps','-p',str(state['pid']),'-o','command='],text=True)
binary=pathlib.Path(state.get('browser_executable','/Applications/Helium.app/Contents/MacOS/Helium'))
installed=pathlib.Path('/Applications/Helium.app/Contents/MacOS/Helium')
rehearsal=root/'.local/update-rehearsal'
if binary!=installed and (not (rehearsal/'.plico-rehearsal').is_file() or rehearsal not in binary.parents or binary.resolve()!=binary):raise SystemExit('Unowned browser executable')
if '--user-data-dir='+str(profile) not in command or not command.startswith(str(binary)+' '):raise SystemExit('Browser identity changed')
proc=subprocess.Popen([str(root/'build/bin/native-input'),str(state['pid']),*sys.argv[1:]])
try:
 code=proc.wait(timeout=10)
except subprocess.TimeoutExpired:
 proc.terminate()  # SIGTERM lets the helper release every test-owned modifier.
 try:proc.wait(timeout=3)
 except subprocess.TimeoutExpired:proc.kill();proc.wait()
 raise SystemExit('Native harness timed out; cleanup requested')
if code:raise SystemExit(code)
