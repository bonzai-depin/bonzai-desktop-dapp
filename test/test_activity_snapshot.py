import ast
import hashlib
import threading
import time
import unittest
from pathlib import Path
from typing import Dict,Any,Optional
class ActivityTest(unittest.TestCase):
 def test_reconnect_recovers_stages_and_outcomes_without_prompts(self):
  source=Path('src/server/diffuser.py').read_text()
  node=next(n for n in ast.parse(source).body if isinstance(n,ast.ClassDef) and n.name=='GenerationTracker')
  events=[]
  env=dict(Dict=Dict,Any=Any,Optional=Optional,threading=threading,time=time,hashlib=hashlib,socket_emit=lambda *args:events.append(args))
  exec(compile(ast.Module(body=[node],type_ignores=[]),'tracker','exec'),env)
  tracker=env['GenerationTracker']()
  gid=tracker.new('wan_video',{'prompt':'private content'})
  tracker.progress(gid,'loading',1,4)
  snapshot=tracker.snapshot()['operations'][0]
  self.assertEqual(snapshot['stage'],'loading')
  self.assertEqual(snapshot['pct'],25)
  self.assertNotIn('private content',str(snapshot))
  tracker.finish(gid)
  self.assertEqual(tracker.snapshot()['operations'][0]['status'],'completed')
  for i in range(40):
   other=tracker.new('image',gen_id=str(i));tracker.error(other,'failed')
  self.assertEqual(len(tracker.snapshot()['operations']),30)
if __name__=='__main__':unittest.main()
