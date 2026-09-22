#!/usr/bin/env python3
"""Install a frozen personal Plico copy. Never modify Helium binaries or profile databases."""
import argparse, base64, ctypes, datetime, hashlib, json, os, pathlib, shutil, subprocess
ROOT=pathlib.Path(__file__).resolve().parent.parent
HOME=pathlib.Path.home()
SUPPORT=HOME/'Library/Application Support/Plico Helium Companion'
APP=HOME/'Applications/Plico Helium Companion.app'
EXTENSION=SUPPORT/'extension'
BROWSER=HOME/'Library/Application Support/net.imput.helium'
HOST=BROWSER/'NativeMessagingHosts/cc.helwig.plico.companion.json'
SOURCE=ROOT/'build/Plico Helium Companion.app'

def move_without_replacement(source,target):
    rename=ctypes.CDLL(None,use_errno=True).renamex_np
    rename.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint];rename.restype=ctypes.c_int
    if rename(os.fsencode(source),os.fsencode(target),4):
        error=ctypes.get_errno();raise OSError(error,os.strerror(error),str(target))

def tree_hash(path):
    digest=hashlib.sha256()
    for item in sorted(path.rglob('*')):
        if item.is_symlink():raise ValueError('Refusing symlink: '+str(item))
        if item.is_file():
            digest.update(str(item.relative_to(path)).encode()+b'\0')
            digest.update(hashlib.sha256(item.read_bytes()).digest())
    return digest.hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=['prepare','install','verify']);args=parser.parse_args()
    for path in [SUPPORT,APP,EXTENSION,BROWSER,HOST,SOURCE]:
        if path.resolve()!=path:raise SystemExit('Refusing linked installation path: '+str(path))
    if not (BROWSER/'Default/Preferences').is_file():raise SystemExit('Expected existing normal Helium Default profile')
    manifest=json.loads((ROOT/'extension/manifest.json').read_text())
    if manifest['background']['service_worker']!='background.mjs' or (ROOT/'extension/qualification-worker.mjs').exists():raise SystemExit('Refusing qualification extension')
    extid=''.join(chr(97+int(c,16)) for c in hashlib.sha256(base64.b64decode(manifest['key'])).hexdigest()[:32])
    subprocess.run(['codesign','--verify','--deep','--strict',str(SOURCE)],check=True)
    requirement=subprocess.check_output(['codesign','-d','-r-',str(SOURCE)],stderr=subprocess.STDOUT,text=True)
    if 'certificate leaf' not in requirement:raise SystemExit('Persistent signed identity required')
    registration={'name':'cc.helwig.plico.companion','description':'Plico Helium Companion','path':str(APP/'Contents/MacOS/plico-companion'),'type':'stdio','allowed_origins':['chrome-extension://'+extid+'/']}
    plan={'app':str(APP),'extension':str(EXTENSION),'host':str(HOST),'extension_id':extid,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'app_sha256':tree_hash(SOURCE),'extension_sha256':tree_hash(ROOT/'extension')}
    if args.action=='prepare':print(json.dumps(plan,indent=2));return
    if args.action=='verify':
        receipt=json.loads((SUPPORT/'installation.json').read_text())
        if tree_hash(APP)!=receipt['app_sha256'] or tree_hash(EXTENSION)!=receipt['extension_sha256'] or json.loads(HOST.read_text())!=registration:raise SystemExit('Installed files differ from receipt')
        subprocess.run(['codesign','--verify','--deep','--strict',str(APP)],check=True)
        print('Installed signature, frozen extension and native registration match the receipt');return
    # First installation only. Never silently replace another app, registration or release.
    if any(p.exists() for p in [APP,EXTENSION,HOST,SUPPORT]):raise SystemExit('Existing installation path found; inspect it before an explicit update')
    SUPPORT.mkdir(mode=0o700,parents=True)
    stage=SUPPORT/('installation-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    stage.mkdir(mode=0o700)
    shutil.copytree(SOURCE,stage/APP.name);shutil.copytree(ROOT/'extension',stage/'extension')
    subprocess.run(['codesign','--verify','--deep','--strict',str(stage/APP.name)],check=True)
    if tree_hash(stage/APP.name)!=plan['app_sha256'] or tree_hash(stage/'extension')!=plan['extension_sha256']:raise SystemExit('Staging integrity mismatch')
    (stage/'native-host.json').write_text(json.dumps(registration,indent=2)+'\n')
    plan['installed_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (stage/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
    published=[]
    try:
        APP.parent.mkdir(exist_ok=True);HOST.parent.mkdir(exist_ok=True)
        for src,dst in [(stage/APP.name,APP),(stage/'extension',EXTENSION),(stage/'native-host.json',HOST)]:
            if dst.exists() or dst.is_symlink():raise RuntimeError('Destination appeared during installation: '+str(dst))
            # All paths live on the same user volume; retaining staged copies permits recovery.
            move_without_replacement(src,dst);published.append((src,dst))
        (SUPPORT/'installation.json').write_text(json.dumps(plan,indent=2)+'\n')
    except BaseException:
        for src,dst in reversed(published):
            if dst.exists() and not src.exists():move_without_replacement(dst,src)
        raise
    print(json.dumps(plan,indent=2))
if __name__=='__main__':main()
