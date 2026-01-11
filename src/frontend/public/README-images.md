# Image Assets

## Social Media Images

### Converting OG Image to PNG

For maximum compatibility with social media platforms, convert `og-image.svg` to PNG:

**Option 1: Using Inkscape (command line)**
```bash
inkscape og-image.svg --export-filename=og-image.png --export-width=1200 --export-height=630
```

**Option 2: Using ImageMagick**
```bash
convert -density 300 -background none og-image.svg -resize 1200x630 og-image.png
```

**Option 3: Online Tool**
- Go to https://cloudconvert.com/svg-to-png
- Upload `og-image.svg`
- Set width to 1200px, height to 630px
- Download as `og-image.png`

After conversion, update `app/layout.tsx` to use `og-image.png` instead of `og-image.svg`.

## Icons

- `favicon.svg` - Modern browsers (vector, scalable)
- `apple-touch-icon.png` - iOS home screen icon
- `logo.svg` - Main logo for the application

## Manifest

The `manifest.json` file references these icons for PWA support.
