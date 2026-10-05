import importlib.util,json,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('scanner',HERE/'scan_order_api.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ScannerTests(unittest.TestCase):
 def scan(self,name,text):
  with tempfile.TemporaryDirectory(prefix='x4-private-') as t:
   p=Path(t)/name;p.write_text(text);return m.scan(p)
 def test_old_operations(self):
  rules={x['rule'] for x in self.scan('old.ts','cancelOrder completeOrder updateShippingTrackingCode debugCreateOrder')['findings']};self.assertEqual(len(rules),4)
 def test_message_migration_not_just_cart(self):
  rules={x['rule'] for x in self.scan('messages.ts','addOrderTransactionMessage OrderTransaction.messages ORDER_TRANSACTION_MESSAGE_CREATED transactionmessage_created')['findings']};self.assertEqual(rules,{'addOrderTransactionMessage','qualified_legacy_messages','legacy_message_webhook'})
 def test_graphql_context_candidate(self):
  rules={x['rule'] for x in self.scan('query.graphql','query { orderTransactions { edges { node { messages { id } } } } }')['findings']};self.assertEqual(rules,{'graphql_order_messages_candidate'})
 def test_unrelated_messages_not_marked(self):self.assertEqual(self.scan('chat.graphql','query { conversation { messages { id } } }')['findings'],[])
 def test_modern_operation_names_not_prefix_matches(self):self.assertEqual(self.scan('new.ts','cancelOrderTransaction completeOrderShipping updateOrderShippingTrackingCode debugCreateOrderTransaction addInquiryMessage inquiry_message_created')['findings'],[])
 def test_graphql_comment_skip(self):self.assertEqual(self.scan('comment.graphql','# orders { messages { id } }')['findings'],[])
 def test_plain_application_order_not_query(self):self.assertEqual(self.scan('app.ts','order({id: 1}); orders.map(x => x);')['findings'],[])
 def test_large_file_skip_is_visible(self):
  r=self.scan('large.ts','x'*(m.MAX_FILE_BYTES+1));self.assertEqual(r['skipped_large_files'],1);self.assertEqual(r['scanned_files'],0)
 def test_bad_encoding_is_incomplete(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'bad.ts';p.write_bytes(b'\xff cancelOrder');r=m.scan(p);self.assertEqual(r['unreadable_files'],1);self.assertEqual(r['scan_status'],'incomplete')
 def test_no_supported_source_is_incomplete(self):self.assertEqual(self.scan('note.txt','cancelOrder')['scan_status'],'incomplete')
 def test_utf8_bom_is_readable(self):self.assertEqual(self.scan('bom.ts','\ufeffcancelOrder')['scan_status'],'complete')
 def test_source_unchanged(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'local.ts';p.write_text('cancelOrder');before=p.read_bytes();m.scan(p);self.assertEqual(p.read_bytes(),before)
 def test_symlink_child_not_followed(self):
  with tempfile.TemporaryDirectory() as t:
   r=Path(t);(r/'actual.ts').write_text('cancelOrder');(r/'alias.ts').symlink_to(r/'actual.ts');self.assertEqual(m.scan(r)['scanned_files'],1)
 def test_skip_dependency_tree(self):
  with tempfile.TemporaryDirectory() as t:
   r=Path(t);(r/'node_modules').mkdir();(r/'node_modules/a.ts').write_text('cancelOrder');(r/'app.ts').write_text('createOrderShipping');self.assertEqual(m.scan(r)['findings'],[])
if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(ScannerTests);r=unittest.TextTestRunner().run(suite)
 (HERE/'scanner-test-results.json').write_text(json.dumps({'tests':r.testsRun,'failures':len(r.failures),'errors':len(r.errors),'all_pass':r.wasSuccessful(),'actual_api_compatibility_verified':False},indent=2)+'\n')
 raise SystemExit(0 if r.wasSuccessful() else 1)
