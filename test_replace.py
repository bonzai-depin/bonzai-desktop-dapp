#!/usr/bin/env python3
path = "/Users/wilhempujar/Development/bonzai-desktop-dapp/src/components/GenerativeAudio.vue"
with open(path, "r") as f:
    content = f.read()

old = '''    <div class="models__deployment-install">
      <div class="columns">
        <div class="column is-12">
          <div class="level">
            <div class="level-left">
              <div class="level-item">
                <h1 class="fira-sans-condensed-black-italic">
                  <span
                    class="material-symbols-outlined mr-2"
                    style="font-size: 92px !important"
                  >
                    graphic_eq
                  </span>
                  Generative Audio
                </h1>
              </div>
            </div>
          </div>'''

new = '''    <div class="bz-audio-workspace">
      <div class="bz-audio__head">
        <div>
          <span class="bz-eyebrow">Generate</span>
          <h1 class="bz-h1">
            <span class="material-symbols-outlined" style="font-size:28px!important;color:var(--bz-purple-300)">graphic_eq</span>
            Generative Audio
          </h1>
        </div>
      </div>'''

print(f"Old string length: {len(old)}")
print(f"New string length: {len(new)}")
print(f"Old in content: {old in content}")

if old in content:
    content = content.replace(old, new)
    print("REPLACED")
else:
    print("NOT FOUND")
    # Find close matches
    idx = content.find('models__deployment-install')
    if idx >= 0:
        print(f"Found 'models__deployment-install' at {idx}")
        print(repr(content[idx-10:idx+200]))

with open(path, "w") as f:
    f.write(content)
