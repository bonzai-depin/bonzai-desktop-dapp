"""Real, tiny CPU training/export/reload test. No downloads or user models."""
import ast
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import GPT2Config, GPT2LMHeadModel

SOURCE = Path(__file__).resolve().parents[1] / 'src/server/diffuser.py'


class TrainingRoundtrip(unittest.TestCase):
    def test_labels_drive_real_training_and_merged_checkpoint_reloads(self):
        tree = ast.parse(SOURCE.read_text())
        helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_tokenize_training_text')
        scope = {}
        exec(compile(ast.Module(body=[helper], type_ignores=[]), str(SOURCE), 'exec'), scope)
        def tokenizer(*args, **kwargs):
            return {'input_ids': [[3, 4, 5, 2, 2, 2]], 'attention_mask': [[1, 1, 1, 1, 0, 0]]}
        tokens = scope['_tokenize_training_text'](tokenizer, ['sample'], 6)
        self.assertEqual(tokens['labels'][0], [3, 4, 5, 2, -100, -100])
        torch.manual_seed(7)
        torch.set_num_threads(1)
        model = GPT2LMHeadModel(GPT2Config(vocab_size=16, bos_token_id=1, eos_token_id=2, pad_token_id=2, n_positions=16, n_embd=16, n_layer=1, n_head=2,
                                          resid_pdrop=0, embd_pdrop=0, attn_pdrop=0))
        model = get_peft_model(model, LoraConfig(r=2, lora_alpha=4, target_modules=['c_attn'], fan_in_fan_out=True, task_type='CAUSAL_LM'))
        batch = {key: torch.tensor(value) for key, value in tokens.items()}
        optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=0.02)
        first = float(model(**batch).loss.detach())
        for _ in range(12):
            optimizer.zero_grad()
            loss = model(**batch).loss
            self.assertTrue(torch.isfinite(loss))
            loss.backward()
            optimizer.step()
        model.eval()
        self.assertLess(float(model(**batch).loss.detach()), first)
        expected = model(**batch).logits.detach()
        with tempfile.TemporaryDirectory() as directory:
            model.save_pretrained(Path(directory) / 'lora', safe_serialization=True)
            self.assertTrue((Path(directory) / 'lora/adapter_model.safetensors').is_file())
            merged = model.merge_and_unload(safe_merge=True)
            model_dir = Path(directory) / 'trained/test-model'
            merged.save_pretrained(model_dir / 'checkpoint', safe_serialization=True)
            (model_dir / 'metadata.json').write_text(json.dumps({'artifact_type': 'checkpoint', 'type': 'llm_checkpoint', 'final_loss': float(loss.detach())}))
            loaded = GPT2LMHeadModel.from_pretrained(model_dir / 'checkpoint', local_files_only=True).eval()
            torch.testing.assert_close(expected, loaded(**batch).logits.detach(), atol=1e-5, rtol=1e-5)
            spec = importlib.util.spec_from_file_location('artifact_validation', Path(__file__).with_name('trained-model-validation.test.py'))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            validate = module.validation_handler(Path(directory))
            body, status = validate('test-model')
            self.assertEqual(status, 200, body)
            (model_dir / 'checkpoint/config.json').unlink()
            body, status = validate('test-model')
            self.assertEqual(status, 422)
            self.assertIn('Standalone checkpoint is missing its model configuration', body['validation']['errors'])


if __name__ == '__main__':
    unittest.main()
