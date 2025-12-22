# Flow Story Generator

Chrome extension for automating sequential image generation in Google Flow (https://labs.google/fx/tools/flow/). Generate visual stories where each image maintains consistency with the previous one.

## Features

- **Character Consistency**: Upload a base character image that will be used in all prompts
- **Sequential Generation**: Each new image uses the previous image as a reference for visual continuity
- **Batch Processing**: Process 60+ prompts automatically
- **Progress Tracking**: Real-time progress indicator and activity log
- **Pause/Resume**: Control the generation process at any time
- **Bulk Download**: Download all generated images with sequential naming (story_001.png, story_002.png, etc.)
- **State Persistence**: Resume from where you left off

## Installation

### Developer Mode (Recommended)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `flow-story-generator` folder
6. The extension icon should appear in your Chrome toolbar

### From Release

1. Download the latest release `.zip` file
2. Extract the contents
3. Follow steps 2-6 above

## Usage

### 1. Navigate to Google Flow

Open https://labs.google/fx/tools/flow/ in Chrome. The extension will automatically detect when you're on the correct page.

### 2. Upload Character Image

Click the upload area to select your base character image. This image will be used as an "ingredient" in every prompt to maintain character consistency.

### 3. Enter Prompts

Paste your prompts in the text area, one per line:

```
A wizard standing in a magical forest at dawn
The wizard casting a powerful spell with blue flames
The wizard battling a fierce dragon
The wizard celebrating victory with magical fireworks
```

### 4. Start Generation

Click "Start Generation" to begin the automated process:

1. The extension uploads your character image
2. Writes the first prompt
3. Clicks "Create" and waits for generation
4. For subsequent prompts:
   - Adds the previously generated image as a reference
   - Uploads the character image again
   - Writes the new prompt
   - Generates the next image

### 5. Download Images

After generation completes, click "Download All Images" to save all generated images to your computer.

## Configuration

Click "Advanced Settings" to customize:

| Setting | Default | Description |
|---------|---------|-------------|
| Generation timeout | 60 seconds | Maximum time to wait for each image |
| Delay between prompts | 2000 ms | Wait time between generating images |
| Max retries on error | 3 | Number of retry attempts for failed generations |
| Download delay | 500 ms | Delay between image downloads |

## Project Structure

```
flow-story-generator/
├── manifest.json          # Extension manifest
├── popup/
│   ├── popup.html        # Extension UI
│   ├── popup.css         # Styles
│   └── popup.js          # UI logic and communication
├── content/
│   └── content.js        # Page automation script
├── background/
│   └── background.js     # Download handling
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Technical Details

### Selectors Used

The extension interacts with Google Flow using these CSS selectors:

| Element | Selector |
|---------|----------|
| Prompt textarea | `textarea#PINHOLE_TEXT_AREA_ELEMENT_ID` |
| Create button | `button[aria-label="Create"]` |
| Add to Prompt | `button[aria-label*="Add To Prompt"]` |
| Add ingredient (+) | `button[aria-label="add"]` |
| File input | `input[type="file"]` |
| Generated images | `img[alt*="Flow Image"]` |

### Permissions

- `activeTab`: Interact with the current tab
- `downloads`: Download generated images
- `storage`: Save extension state
- `scripting`: Inject content script

## Troubleshooting

### Extension shows "Disconnected"

Make sure you're on the Google Flow page: https://labs.google/fx/tools/flow/

### Images not generating

1. Check that you're logged into Google
2. Verify you have remaining credits in Google Flow
3. Try increasing the generation timeout in settings
4. Refresh the page and try again

### Downloads not working

1. Check Chrome's download settings
2. Ensure downloads aren't being blocked by another extension
3. Try downloading a single image first to test

### Upload not working

1. Ensure your image is in a supported format (PNG, JPG, JPEG, WEBP)
2. Try a smaller image file
3. Check the browser console for errors

## Limitations

- Image URLs from Google Flow are temporary (they expire)
- Generation time varies (typically 10-12 seconds per image)
- Google Flow may have rate limits or usage quotas
- The extension depends on Google Flow's current DOM structure

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify for your projects.

## Disclaimer

This extension is not affiliated with Google. Use responsibly and in accordance with Google's terms of service.
