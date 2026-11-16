"""Flow-matching ER-SDE (third order), using a beta-distributed schedule.

Equations: Cui et al., https://arxiv.org/abs/2309.06169. Work in noise/signal
ratio coordinates, converting flow velocity to a clean-sample prediction.
This is a request-local scheduler; no global Diffusers patches.
"""
import torch
from diffusers import FlowMatchEulerDiscreteScheduler
from diffusers.utils.torch_utils import randn_tensor


class QwenERSDEScheduler(FlowMatchEulerDiscreteScheduler):
    def set_timesteps(self, num_inference_steps=None, device=None, sigmas=None, mu=None, timesteps=None):
        super().set_timesteps(num_inference_steps, device=device, sigmas=sigmas, mu=mu, timesteps=timesteps)
        # A flow sigma of exactly one has infinite noise/signal ratio.
        self.sigmas[0] = min(float(self.sigmas[0]), 0.9999)
        self.timesteps = self.sigmas[:-1].to(device) * self.config.num_train_timesteps
        self._clean_history = []
        self._slope = None

    @staticmethod
    def _phi(ratio):
        return ratio * (torch.exp(ratio.pow(0.3)) + 10)

    def step(self, model_output, timestep, sample, return_dict=True, **kwargs):
        if self.step_index is None:
            self._init_step_index(timestep)
        index = self.step_index
        sigma, following = self.sigmas[index:index + 2].to(sample.device)
        clean = sample.float() - sigma * model_output.float()
        if following == 0:
            result = clean
        else:
            ratios = self.sigmas.to(sample.device) / (1 - self.sigmas.to(sample.device))
            current, target = ratios[index:index + 2]
            signal = 1 - following
            decay = self._phi(target) / self._phi(current)
            result = signal * (decay * sample.float() / (1 - sigma) + (1 - decay) * clean)
            if self._clean_history:
                delta = target - current
                grid = target + torch.arange(200, device=sample.device) * (-delta / 200)
                reciprocal = 1 / self._phi(grid)
                slope = (clean - self._clean_history[-1]) / (current - ratios[index - 1])
                result += signal * (delta + self._phi(target) * reciprocal.sum() * (-delta / 200)) * slope
                if self._slope is not None:
                    curvature = 2 * (slope - self._slope) / (current - ratios[index - 2])
                    integral = ((grid - current) * reciprocal).sum() * (-delta / 200)
                    result += signal * (delta.square() / 2 + self._phi(target) * integral) * curvature
                self._slope = slope
            variance = (target.square() - current.square() * decay.square()).clamp_min(0)
            noise = randn_tensor(sample.shape, generator=self.generator, device=sample.device, dtype=torch.float32)
            result += signal * variance.sqrt() * noise
        self._clean_history = [clean]
        self._step_index += 1
        result = result.to(sample.dtype)
        if not return_dict:
            return (result,)
        from diffusers.schedulers.scheduling_flow_match_euler_discrete import FlowMatchEulerDiscreteSchedulerOutput
        return FlowMatchEulerDiscreteSchedulerOutput(prev_sample=result)


def qwen_scheduler(config, seed):
    scheduler = QwenERSDEScheduler.from_config(config, use_beta_sigmas=True,
        use_karras_sigmas=False, use_exponential_sigmas=False)
    scheduler.generator = torch.Generator(device='cpu').manual_seed(seed)
    return scheduler
