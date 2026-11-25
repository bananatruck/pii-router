# Recording the demo video

`scripts/record-demo.mjs` records the submission video from a running copy of the app.
It walks the flow in `submission/VIDEO_SCRIPT.md` with human-paced pauses in Playwright's Chromium, writes English captions timed to what actually happened, and makes a 1920x1080 H.264 MP4 with those captions burned into a band below the app.
There is no voice track.

Prerequisites: `ffmpeg` and `ffprobe` on the PATH, with an ffmpeg build that has the `libx264` encoder and the `subtitles` filter (libass), and Playwright's Chromium (`pnpm exec playwright install chromium`).

```sh
# The labelled simulated demo (any time):
pnpm record:demo --url https://bananatruck.github.io/pii-router/ --mode simulated

# The real run, after submission/SETUP_FOR_KESH.md, with `pnpm dev` running and Chrome closed:
pnpm record:demo --url http://localhost:5173/ --mode live \
  --executable <path to your Chrome> --profile <a separate Chrome user-data dir>
```

Output goes to `submission/video/` (gitignored): `demo-<mode>-take.mp4` and `demo-<mode>-take.srt`.
Upload the `.srt` to YouTube as the English captions.
The script stops with an error if the page's mode does not match `--mode`, and if the video would exceed the 3-minute limit.

## What differs between the modes

- Simulated captions say on screen that a stand-in plays both models, and the page's simulated banner is visible in every frame.
- Live captions follow the narration in `submission/VIDEO_SCRIPT.md`.
  The live take skips the fail-closed scene, because the script cannot change Chrome's flags; record that shot by hand as the video script describes, or keep it out of the video.
- The live take must run in a Chrome profile where Gemini Nano is downloaded and the App Check debug token is registered; Playwright's bundled Chromium has neither, so pass `--executable` and `--profile`.
  Use a separate user-data directory, not your everyday profile: recent Chrome versions refuse automation of the default profile. Open Chrome once with `--user-data-dir=<that directory>`, enable the flag, let Gemini Nano download, and register that profile's own App Check debug token, then record with it.
  Those two options were not tested on the build machine, which cannot download Gemini Nano; if they do not work with the Flatpak Chrome, screen-record the same steps by hand with the captions from the `.srt` of a simulated take as a guide.

## Checking a take

Extract a frame per caption cue and look at each one before uploading:

```sh
ffmpeg -ss 30 -i submission/video/demo-simulated-take.mp4 -frames:v 1 /tmp/frame.jpg
```

Each frame should show the app working, no personal data other than the synthetic samples, and no third-party logos or trademarks.
