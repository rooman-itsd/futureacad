# Partner logos

Drop the official logo files here and the travelling row on `/work` switches
from wordmarks to logos automatically, on the next request. No code change.

Expected filenames (first match wins: `.svg`, then `.png`, then `.webp`):

| File           | Partner   |
| -------------- | --------- |
| `microsoft.*`  | Microsoft |
| `cisco.*`      | Cisco     |
| `aws.*`        | AWS       |
| `google.*`     | Google    |
| `red-hat.*`    | Red Hat   |
| `vmware.*`     | VMware    |
| `nasscom.*`    | nasscom   |

Notes:

- SVG is preferred. The row renders each mark at roughly 24 to 34px tall and
  scales the width to suit, so a wide wordmark and a square glyph both work.
- Use each company's own asset from their brand or press page. These are
  registered trademarks; a redrawn approximation misrepresents them and is
  usually a breach of their brand terms.
- A partner with no file simply keeps its wordmark, so the row is never
  broken while files are arriving one at a time.
