import importlib.util,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('publish',pathlib.Path(__file__).resolve().parents[1]/'scripts/publish-build.py');publish=importlib.util.module_from_spec(spec);spec.loader.exec_module(publish)
class PublishTest(unittest.TestCase):
 def test_exchange_preserves_prior_app(self):
  with tempfile.TemporaryDirectory() as d:
   old=pathlib.Path(d)/'installed';new=pathlib.Path(d)/'candidate';old.mkdir();new.mkdir();(old/'version').write_text('old');(new/'version').write_text('new');publish.exchange(new,old);self.assertEqual((old/'version').read_text(),'new');self.assertEqual((new/'version').read_text(),'old');publish.exchange(new,old);self.assertEqual((old/'version').read_text(),'old')
 def test_failed_exchange_preserves_installed(self):
  with tempfile.TemporaryDirectory() as d:
   old=pathlib.Path(d)/'installed';old.mkdir();(old/'version').write_text('old')
   with self.assertRaises(OSError):publish.exchange(pathlib.Path(d)/'missing',old)
   self.assertEqual((old/'version').read_text(),'old')
 def test_symlink_refused(self):
  with tempfile.TemporaryDirectory() as d:
   old=pathlib.Path(d)/'installed';old.mkdir();new=pathlib.Path(d)/'candidate';new.symlink_to(old)
   with self.assertRaises(ValueError):publish.exchange(new,old)
if __name__=='__main__':unittest.main()
