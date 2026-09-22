#!/usr/bin/env python3
"""Stage a signed personal update; retain and verify both releases for rollback."""
import argparse,datetime,importlib.util,json,os,pathlib,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('personal',ROOT/'scripts/install-personal.py');personal=importlib.util.module_from_spec(spec);spec.loader.exec_module(personal)
spec=importlib.util.spec_from_file_location('publication',ROOT/'scripts/publish-build.py');publication=importlib.util.module_from_spec(spec);spec.loader.exec_module(publication)
SUPPORT,APP,EXTENSION,HOST=personal.SUPPORT,personal.APP,personal.EXTENSION,personal.HOST
RECEIPT=SUPPORT/'installation.json'
def save_journal(stage,journal):
 # A failed or interrupted write leaves the previous complete journal readable.
 fd,name=tempfile.mkstemp(prefix='journal-pending-',dir=stage)
 with os.fdopen(fd,'w') as stream:
  stream.write(json.dumps(journal,indent=2)+'\n');stream.flush();os.fsync(stream.fileno())
 os.replace(name,stage/'journal.json')
def signature(app):
 subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
 return subprocess.check_output(['codesign','-d','-r-',str(app)],stderr=subprocess.STDOUT,text=True).split('designated => ',1)[1].strip()
def verify(receipt,app,extension):
 if personal.tree_hash(app)!=receipt['app_sha256'] or personal.tree_hash(extension)!=receipt['extension_sha256']:raise SystemExit('Release content differs from its receipt')
 signature(app)
def disconnected():
 binary=str(APP/'Contents/MacOS/plico-companion')
 for row in subprocess.check_output(['ps','-axo','command='],text=True).splitlines():
  if row.strip().startswith(binary+' '):raise SystemExit('Disconnect the personal extension before publishing or rolling back')
def recover(stage):
 journal=json.loads((stage/'journal.json').read_text())
 if journal['state']!='swapping':raise SystemExit('Recovery is only for an interrupted exchange')
 old,new=journal['old'],journal['new'];disconnected()
 # Inspect every pair before exchanging anything. Unknown bytes are never replaced.
 moves=[]
 for src,dst,key in [(stage/APP.name,APP,'app_sha256'),(stage/'extension',EXTENSION,'extension_sha256')]:
  source,dest=personal.tree_hash(src),personal.tree_hash(dst)
  if source==new[key] and dest==old[key]:continue
  if source==old[key] and dest==new[key]:moves.append((src,dst));continue
  raise SystemExit('Interrupted release contains unknown content; inspect manually')
 src,dst=stage/'installation.json',RECEIPT
 source,dest=json.loads(src.read_text()),json.loads(dst.read_text())
 if source==new and dest==old:pass
 elif source==old and dest==new:moves.append((src,dst))
 else:raise SystemExit('Interrupted receipts do not match the journal')
 if signature(stage/APP.name)!=signature(APP):raise SystemExit('Signing identity changed')
 for src,dst in moves:publication.exchange(src,dst)
 verify(old,APP,EXTENSION);journal['state']='recovered';save_journal(stage,journal)
 print('Recovered prior release; candidate retained at '+str(stage))

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['prepare','publish','rollback','recover']);parser.add_argument('stage',nargs='?');args=parser.parse_args()
 for path in [APP,EXTENSION,SUPPORT,HOST,RECEIPT]:
  if path.resolve()!=path:raise SystemExit('Linked installation path refused')
 if args.action=='recover':
  stage=pathlib.Path(args.stage or '').absolute()
  if stage.parent!=SUPPORT or not stage.name.startswith('update-') or stage.resolve()!=stage:raise SystemExit('Unowned stage')
  recover(stage);return
 current=json.loads(RECEIPT.read_text());verify(current,APP,EXTENSION)
 registration=json.loads(HOST.read_text())
 if registration['path']!=str(APP/'Contents/MacOS/plico-companion') or registration['allowed_origins']!=['chrome-extension://'+current['extension_id']+'/']:raise SystemExit('Registration changed; inspect before update')
 if args.action=='prepare':
  if signature(personal.SOURCE)!=signature(APP):raise SystemExit('Signing identity changed')
  source_manifest=json.loads((ROOT/'extension/manifest.json').read_text());installed_manifest=json.loads((EXTENSION/'manifest.json').read_text())
  if source_manifest['key']!=installed_manifest['key'] or source_manifest['permissions']!=installed_manifest['permissions'] or source_manifest['background']['service_worker']!='background.mjs':raise SystemExit('Extension identity, access or entrypoint changed; review separately')
  stage=SUPPORT/('update-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));stage.mkdir(mode=0o700)
  shutil.copytree(personal.SOURCE,stage/APP.name);shutil.copytree(ROOT/'extension',stage/'extension')
  candidate={**current,'source_dirty':bool(subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip()),'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'app_sha256':personal.tree_hash(personal.SOURCE),'extension_sha256':personal.tree_hash(ROOT/'extension'),'installed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'release':source_manifest['version']}
  verify(candidate,stage/APP.name,stage/'extension')
  (stage/'installation.json').write_text(json.dumps(candidate,indent=2)+'\n')
  save_journal(stage,{'state':'prepared','old':current,'new':candidate});print(stage);return
 if not args.stage:raise SystemExit('Stage path required')
 stage=pathlib.Path(args.stage).absolute()
 if stage.parent!=SUPPORT or not stage.name.startswith('update-') or stage.resolve()!=stage:raise SystemExit('Unowned stage')
 journal=json.loads((stage/'journal.json').read_text());rollback=args.action=='rollback'
 if journal['state']!=('published' if rollback else 'prepared'):raise SystemExit('Unexpected update state; inspect retained files before retrying')
 expected=journal['new' if rollback else 'old'];incoming=journal['old' if rollback else 'new']
 if current!=expected:raise SystemExit('Installed receipt changed')
 staged_receipt=json.loads((stage/'installation.json').read_text())
 if staged_receipt!=incoming:raise SystemExit('Staged receipt changed')
 verify(incoming,stage/APP.name,stage/'extension')
 if signature(stage/APP.name)!=signature(APP):raise SystemExit('Signing identity changed')
 disconnected();journal['state']='swapping';save_journal(stage,journal)
 done=[]
 try:
  for src,dst in [(stage/APP.name,APP),(stage/'extension',EXTENSION),(stage/'installation.json',RECEIPT)]:publication.exchange(src,dst);done.append((src,dst))
  verify(incoming,APP,EXTENSION)
 except BaseException:
  for src,dst in reversed(done):publication.exchange(src,dst)
  journal['state']='published' if rollback else 'prepared';save_journal(stage,journal);raise
 journal['state']='rolled-back' if rollback else 'published';save_journal(stage,journal);print('Verified '+journal['state']+'; prior release retained at '+str(stage))
if __name__=='__main__':main()
