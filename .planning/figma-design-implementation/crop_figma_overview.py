from pathlib import Path

from PIL import Image


SOURCE = Path(__file__).with_name("figma-overview-full.png")
image = Image.open(SOURCE)

# The source is one flattened, very tall Figma frame. Crop it into logical
# regions so page groups remain readable during product-scope analysis.
regions = {
    "01_onboarding_identity.png": (0, 1500, image.width, 6200),
    "02_main_pairing.png": (0, 6000, image.width, 11100),
    "03_chat_sharing.png": (0, 10800, image.width, 16000),
    "04_settings_security.png": (0, 15700, image.width, 20500),
    "05_specs_flows.png": (0, 20200, image.width, image.height),
}

for filename, bounds in regions.items():
    image.crop(bounds).save(SOURCE.with_name(filename))
