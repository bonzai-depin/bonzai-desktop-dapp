"""Run with the installed inference environment; no model downloads required."""
import ast
import unittest
from pathlib import Path


class InferenceImportSmokeTest(unittest.TestCase):
    def test_native_sparse_solver_loads_and_runs(self):
        # Older SciPy wheels fail dyld validation on macOS 27, blocking PEFT.
        import numpy as np
        from scipy.sparse.linalg import svds

        singular_values = svds(
            np.diag([1.0, 2.0, 3.0, 4.0]),
            k=2,
            solver="propack",
            return_singular_vectors=False,
        )
        np.testing.assert_allclose(singular_values, [3.0, 4.0])

    def test_server_diffusers_imports_without_loading_models(self):
        source = Path(__file__).parents[1] / "src/server/diffuser.py"
        namespace = {}
        imports = [
            node for node in ast.parse(source.read_text(encoding="utf-8")).body
            if isinstance(node, ast.ImportFrom)
            and (node.module or "").split(".")[0] == "diffusers"
        ]
        self.assertTrue(imports, "Server Diffusers imports must be exercised")
        for node in imports:
            exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)


if __name__ == "__main__":
    unittest.main()
