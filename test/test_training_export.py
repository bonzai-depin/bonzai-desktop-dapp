import sys
import tempfile
import unittest
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).parents[1]/'src/server'))
from training_export import run_export_command, require_finite_weights

class TrainingExportTests(unittest.TestCase):
    def test_failure_reports_error_tail_and_keeps_full_log_and_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source.gguf'; source.write_bytes(b'preserve me')
            log=root/'quantization.log'
            with self.assertRaisesRegex(RuntimeError,'actual tensor failure'):
                run_export_command([sys.executable,'-c',"import sys;print('header'*2000);print('actual tensor failure',file=sys.stderr);sys.exit(1)"],log,'Quantization',10)
            self.assertGreater(log.stat().st_size,10000)
            self.assertEqual(source.read_bytes(),b'preserve me')

    def test_invalid_weights_cannot_be_exported_as_success(self):
        model=torch.nn.Linear(2,2)
        require_finite_weights(model)
        with torch.no_grad():model.weight[0,0]=float('nan')
        with self.assertRaisesRegex(RuntimeError,'non-finite weights in weight'):
            require_finite_weights(model)

if __name__=='__main__':unittest.main()
