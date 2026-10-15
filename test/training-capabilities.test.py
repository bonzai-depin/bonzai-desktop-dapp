"""Exercise lightweight training handlers without loading the ML runtime."""
import ast
from pathlib import Path
import types
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'src/server/diffuser.py'
TREE = ast.parse(SOURCE.read_text())


def handler(name, values=None):
    function = next(node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name == name)
    function.decorator_list = []
    namespace = {'jsonify': lambda value: value, **(values or {})}
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), 'exec'), namespace)
    return namespace[name]


class TrainingCapabilities(unittest.TestCase):
    def test_placeholders_reject_before_touching_requests_or_starting_workers(self):
        for name in ('start_audio_lora_training', 'start_video_lora_training'):
            body, status = handler(name)()
            self.assertEqual(status, 501)
            self.assertEqual(body['code'], 'training_not_implemented')
            self.assertNotIn('training_id', body)

    def test_capabilities_do_not_advertise_placeholder_trainers(self):
        body, status = handler('training_info', {
            'DeviceManager': types.SimpleNamespace(get_device=lambda: types.SimpleNamespace(type='cpu')),
            '_json_sanitize': lambda value: value,
            'LLM_FINETUNE_MODELS': {'model': 'org/model'},
            'SDXL_BASE_REPO': 'org/sdxl',
            'ABLIT_MODEL_INFO': [],
            '_find_quantize_binary': lambda: None,
            '_find_convert_script': lambda: None,
        })()
        self.assertEqual(status, 200)
        self.assertEqual(body['supported_audio_models'], [])
        self.assertEqual(body['supported_video_models'], [])
        self.assertFalse(body['training_modalities']['audio']['implemented'])
        self.assertFalse(body['training_modalities']['video']['implemented'])
        self.assertFalse(body['training_modalities']['image']['desktop_import_supported'])
        self.assertEqual([model['key'] for model in body['supported_image_models']], ['sdxl-base-1.0'])


if __name__ == '__main__':
    unittest.main()
