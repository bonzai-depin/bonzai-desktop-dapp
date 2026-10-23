import sys, unittest
from pathlib import Path
import torch
sys.path.insert(0,str(Path(__file__).parents[1]/'src/server'))
from qwen_image_scheduler import qwen_scheduler
class QwenSchedulerTests(unittest.TestCase):
    def sample(self, seed):
        scheduler=qwen_scheduler({},seed)
        scheduler.set_timesteps(25, sigmas=[1-i/25 for i in range(25)],mu=0.5)
        self.assertTrue(scheduler.config.use_beta_sigmas)
        self.assertTrue(torch.all(scheduler.sigmas[:-1]>scheduler.sigmas[1:]))
        self.assertLess(float(scheduler.sigmas[0]),1)
        x=torch.ones(1,3,8)
        for t in scheduler.timesteps:
            x=scheduler.step(x*.1,t,x,return_dict=False)[0]
            self.assertTrue(torch.isfinite(x).all())
        return x
    def test_seed_controls_sde_noise_and_schedule_resets(self):
        torch.testing.assert_close(self.sample(7),self.sample(7))
        self.assertFalse(torch.equal(self.sample(7),self.sample(8)))
