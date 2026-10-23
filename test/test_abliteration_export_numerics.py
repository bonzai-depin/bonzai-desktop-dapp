import sys
import unittest
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).parents[1]/'src/obliteratus'))
from obliteratus.abliterate import AbliterationPipeline
sys.path.insert(0,str(Path(__file__).parents[1]/'src/server'))
from abliteration_numerics import stabilize_abliteration
stabilize_abliteration(AbliterationPipeline)

class ProjectionNumericsTests(unittest.TestCase):
    def test_half_precision_large_embedding_keeps_finite_preserved_norm(self):
        for transposed in [False,True]:
            with self.subTest(transposed=transposed):
                rows,cols=(512,256) if transposed else (256,512)
                module=torch.nn.Module()
                module.proj=torch.nn.Linear(cols,rows,bias=False,dtype=torch.float16)
                with torch.no_grad():module.proj.weight.fill_(1)
                before=module.proj.weight.float().norm().item()
                self.assertTrue(torch.isinf(module.proj.weight.square().sum()).item())
                direction=torch.zeros(512,1,dtype=torch.float16);direction[0]=1
                count=AbliterationPipeline._project_out_advanced(module,direction,['proj'],norm_preserve=True,regularization=.5)
                self.assertEqual(count,1)
                self.assertTrue(torch.isfinite(module.proj.weight).all().item())
                self.assertAlmostEqual(module.proj.weight.float().norm().item()/before,1,places=3)

if __name__=='__main__':unittest.main()
