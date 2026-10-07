import sys, glob, os
from PIL import Image
d = sys.argv[1] if len(sys.argv) > 1 else "dist/preview"
for p in glob.glob(os.path.join(d, "*.ppm")):
    Image.open(p).save(p[:-4] + ".png")
    os.remove(p)
print("converted")
