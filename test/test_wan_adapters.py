import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from wan_adapters import WAN_ADAPTERS, load_wan_adapters

class WanAdaptersTest(unittest.TestCase):
    def test_six_adapters_target_correct_experts_at_quarter_strength(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for filename, *_ in WAN_ADAPTERS:
                (root/filename).touch()
            pipe=Mock()
            with patch('wan_adapters.load_file', return_value={'weight':'fixture'}) as read:
                result=load_wan_adapters(pipe,root,{},Mock())
            self.assertEqual(len(result),6)
            self.assertEqual([c.kwargs['load_into_transformer_2'] for c in pipe.load_lora_weights.call_args_list],[False,True,False,True,False,True])
            self.assertTrue(any(c.args[0].endswith('wan-lora-animation-high-safetensors') for c in read.call_args_list))
            self.assertEqual(pipe.set_adapters.call_args.kwargs['adapter_weights'],[.25]*6)
            pipe.fuse_lora.assert_not_called()

    def test_missing_or_disabled_adapters_are_not_applied(self):
        with tempfile.TemporaryDirectory() as directory:
            pipe=Mock()
            self.assertEqual(load_wan_adapters(pipe,Path(directory),{},Mock()),[])
            pipe.set_adapters.assert_not_called()

    def test_invalid_adapter_fails_instead_of_silently_ignoring(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/WAN_ADAPTERS[0][0]).touch()
            with patch('wan_adapters.load_file',side_effect=ValueError('bad weights')):
                with self.assertRaisesRegex(ValueError,'wan-lora-high'):
                    load_wan_adapters(Mock(),root,{},Mock())

if __name__=='__main__':unittest.main()
