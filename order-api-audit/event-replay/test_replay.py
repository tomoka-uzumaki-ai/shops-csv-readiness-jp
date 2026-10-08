#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from replay_events import load, replay, ContractError

HERE = Path(__file__).parent
class ReplayTests(unittest.TestCase):
    def case(self, name):
        return replay(load(HERE/'fixtures'/(name+'.json')))
    def test_accepted_mixed(self):
        r=self.case('accepted-mixed')
        self.assertEqual(r['status'],'accepted_synthetic_contract')
        for step in r['timeline']:
            for order in step['snapshot'].values():
                t=order['totals']
                self.assertEqual(t['purchased'],t['remaining']+t['sent']+t['canceled'])
        self.assertEqual(r['final_snapshot']['order-demo']['totals'],{'purchased':5,'remaining':0,'sent':3,'canceled':2,'pending_cancel':0})
    def test_partial_cancellation_remaining_ships(self):
        r=self.case('partial-cancel-then-ship')
        self.assertEqual(r['status'],'accepted_synthetic_contract')
        self.assertEqual(r['final_snapshot']['order-demo']['totals'],{'purchased':3,'remaining':0,'sent':2,'canceled':1,'pending_cancel':0})
    def test_pending_is_not_cancelled(self):
        t=self.case('request-pending')['final_snapshot']['order-demo']['totals']
        self.assertEqual((t['remaining'],t['canceled'],t['pending_cancel']),(4,0,2))
    def test_resend_and_distinct_event(self):
        r=self.case('identical-resend')
        self.assertEqual(r['timeline'][2]['effect'],'duplicate_ignored')
        self.assertEqual(r['final_snapshot']['order-demo']['totals']['sent'],2)
        self.assertEqual(r['timeline'][1]['snapshot'],r['timeline'][2]['snapshot'])
    def test_stop_failures(self):
        for name,pos in [('conflicting-resend',3),('before-created',1),('after-canceled',4),('over-shipment',2),('completion-without-request',2),('atomic-mixed-failure',2)]:
            with self.subTest(name=name):
                r=self.case(name)
                self.assertEqual(r['status'],'stopped');self.assertEqual(r['failed_position'],pos)
        self.assertEqual(self.case('atomic-mixed-failure')['final_snapshot']['order-demo']['totals']['sent'],0)
    def test_input_validation(self):
        base=load(HERE/'fixtures'/'accepted-mixed.json')
        for value in [True,-1,0,1.5,1000001]:
            bad=json.loads(json.dumps(base));bad['events'][0]['items'][0]['quantity']=value
            with self.assertRaises(ContractError): replay(bad)
        bad=json.loads(json.dumps(base));bad['events'][0]['token']='never-allowed'
        with self.assertRaises(ContractError): replay(bad)
        bad=json.loads(json.dumps(base));bad['events']=bad['events']*100
        with self.assertRaises(ContractError): replay(bad)
    def cli(self, source, target):
        return subprocess.run([sys.executable,str(HERE/'replay_events.py'),str(source),'--output',str(target)],capture_output=True,text=True)
    def test_actual_cli_files(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'report.json';source=HERE/'fixtures'/'identical-resend.json'
            before=hashlib.sha256(source.read_bytes()).hexdigest()
            self.assertEqual(self.cli(source,target).returncode,0)
            self.assertEqual(json.loads(target.read_text())['status'],'accepted_synthetic_contract')
            saved=target.read_bytes();self.assertEqual(self.cli(source,target).returncode,3);self.assertEqual(target.read_bytes(),saved)
            self.assertEqual(before,hashlib.sha256(source.read_bytes()).hexdigest())
            failed=Path(folder)/'failed.json';self.assertEqual(self.cli(HERE/'fixtures'/'conflicting-resend.json',failed).returncode,2)
            self.assertEqual(json.loads(failed.read_text())['status'],'stopped')
            invalid=Path(folder)/'invalid.json';invalid.write_text('{"schema":"x"}');dest=Path(folder)/'no-report.json'
            self.assertEqual(self.cli(invalid,dest).returncode,3);self.assertFalse(dest.exists())
            invalid.write_bytes(b' '*1048577);self.assertEqual(self.cli(invalid,dest).returncode,3)
            invalid.write_text('{"schema":"a","schema":"b"}');self.assertEqual(self.cli(invalid,dest).returncode,3)
if __name__=='__main__':unittest.main()
