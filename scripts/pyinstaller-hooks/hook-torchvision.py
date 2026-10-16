"""Bundle torchvision's dynamically loaded operators, including nightly stable ABI libraries.

The upstream hook assumes torchvision._C is a Python extension. Newer wheels
load _C_stable/image_stable with torch.ops.load_library instead; these must be
collected as binaries so PyInstaller also resolves their native dependencies.
"""
from PyInstaller.utils.hooks import collect_dynamic_libs

binaries = collect_dynamic_libs(
    'torchvision', search_patterns=['*.so', '*.so.*', '*.dylib', '*.dll', '*.pyd'],
)
# Preserve source for TorchScript just as the upstream torchvision hook does.
module_collection_mode = 'pyz+py'
