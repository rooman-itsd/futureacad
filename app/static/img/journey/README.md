# Journey step icons

Drop a file here and step 01 of the delivery journey on the home page uses it
instead of its inline SVG, on the next request. No code change.

| File          | Step        |
| ------------- | ----------- |
| `discover.*`  | 01 Discover |

First match wins: `.svg`, then `.png`, then `.webp`.

The file must have a **transparent background**. The node is a circle, so an
image on a solid backdrop shows as a square inside it.

It must also be free of watermarks. The magnifier supplied on 23 Sep was a
stock-site preview with "pngtree" tiled across it (about 13,000 watermark
pixels) on an opaque light-grey background, so it was not used.

Note the other four steps are single-colour line icons drawn to match each
other. A full-colour illustration in step 01 alone will look out of place
unless the other four are replaced at the same time.
