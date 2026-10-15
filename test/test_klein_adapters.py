import sys
import unittest
from pathlib import Path
import torch
sys.path.insert(0, str(Path(__file__).parents[1] / 'src/server'))
from klein_adapters import lokr_delta, install_lokr

class KleinAdapterTest(unittest.TestCase):
    def test_exact_kronecker_without_dense_weights(self):
        for device in ['cpu'] + (['mps'] if torch.backends.mps.is_available() else []) + (['cuda'] if torch.cuda.is_available() else []):
            x=torch.randn(2,4,12,device=device)
            a=torch.randn(3,2,device=device);b=torch.randn(5,6,device=device)
            torch.testing.assert_close(lokr_delta(x,a,b),torch.nn.functional.linear(x,torch.kron(a,b)),atol=1e-5,rtol=1e-5)

    def test_fused_qkv_split_scaling_and_removal(self):
        root=torch.nn.Module()
        attn=torch.nn.Module()
        for key in ['to_q','to_k','to_v']:
            setattr(attn,key,torch.nn.Linear(4,4,bias=False))
        block=torch.nn.Module();block.attn=attn
        root.transformer_blocks=torch.nn.ModuleList([block])
        a=torch.randn(3,2);b=torch.randn(4,2)
        state={'diffusion_model.double_blocks.0.img_attn.qkv.'+key:value for key,value in [('lokr_w1',a),('lokr_w2',b),('alpha',torch.tensor(32.))]}
        x=torch.randn(2,3,4)
        before=torch.cat([getattr(attn,k)(x) for k in ['to_q','to_k','to_v']],-1)
        handles=install_lokr(root,state,.5)
        after=torch.cat([getattr(attn,k)(x) for k in ['to_q','to_k','to_v']],-1)
        torch.testing.assert_close(after,before+.5*torch.nn.functional.linear(x,torch.kron(a,b)))
        for handle in handles:handle.remove()
        torch.testing.assert_close(torch.cat([getattr(attn,k)(x) for k in ['to_q','to_k','to_v']],-1),before)

    def test_unknown_tensor_rejected_before_mutation(self):
        with self.assertRaisesRegex(ValueError,'Unsupported'):
            install_lokr(torch.nn.Module(),{'x.lokr_t2':torch.ones(2)},.5)

if __name__=='__main__':unittest.main()
