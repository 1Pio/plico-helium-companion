#!/usr/bin/env python3
"""Offline snapshots/rollback of the single owned qualification profile only."""
import pathlib,subprocess,sys,shutil,datetime,json
root=pathlib.Path(__file__).resolve().parent.parent
profile=root/'.local/helium-qualification-profile';folder=root/'.local/update-rehearsal'
if not (profile/'.plico-isolated').is_file() or profile.is_symlink():raise SystemExit('Unmarked profile')
lines=subprocess.check_output(['ps','-axo','command='],text=True).splitlines()
if any('--user-data-dir='+str(profile) in line for line in lines):raise SystemExit('Close the isolated browser before snapshot/rollback')
folder.mkdir(exist_ok=True);(folder/'.plico-rehearsal').touch()
snapshot=folder/'profile-before-update'
mode=sys.argv[1] if len(sys.argv)>1 else ''
if mode=='snapshot':
 if snapshot.exists():raise SystemExit('Existing snapshot preserved')
 shutil.copytree(profile,snapshot,symlinks=True,ignore=shutil.ignore_patterns('Singleton*','DevToolsActivePort'))
 print('Owned profile snapshot saved')
elif mode=='rollback':
 if not (snapshot/'.plico-isolated').is_file():raise SystemExit('No marked rollback snapshot')
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 retained=folder/('profile-after-update-'+stamp)
 if retained.exists():raise SystemExit('Retained path exists')
 candidate=folder/('rollback-candidate-'+stamp)
 shutil.copytree(snapshot,candidate,symlinks=True,ignore=shutil.ignore_patterns('Singleton*','DevToolsActivePort'))
 profile.rename(retained)
 try:candidate.rename(profile)
 except BaseException:retained.rename(profile);raise
 print('Original profile snapshot restored; upgraded profile retained separately')
else:raise SystemExit('snapshot|rollback only')
