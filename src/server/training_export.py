"""Export diagnostics must survive failures without deleting trained weights."""
from pathlib import Path
import subprocess


def run_export_command(command, log_path, label, timeout):
    log_path = Path(log_path)
    with log_path.open('w', encoding='utf-8') as log:
        try:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=timeout)
        except subprocess.TimeoutExpired as error:
            raise RuntimeError(f'{label} timed out after {timeout}s. Full log: {log_path}') from error
    if result.returncode:
        with log_path.open('rb') as log:
            log.seek(max(0, log_path.stat().st_size - 4000))
            tail = log.read().decode('utf-8', errors='replace').strip()
        raise RuntimeError(f'{label} failed (exit {result.returncode}): {tail}\nFull log: {log_path}')
    return result


def require_finite_weights(model):
    import torch
    for name, weight in model.named_parameters():
        if weight.is_floating_point() and not torch.isfinite(weight).all().item():
            raise RuntimeError(f'Uncensoring produced non-finite weights in {name}; export stopped. The model has not been published to your library.')
