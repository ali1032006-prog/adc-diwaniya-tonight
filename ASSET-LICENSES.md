# Asset licences

Every image, icon set, font and illustration in this repo. Design contract: ADC-RES-50 (Notion, Research & Ideas).

| Asset | Path | Source | Licence | Author | Changes |
|---|---|---|---|---|---|
| Readex Pro (variable, Arabic + Latin) | npm `@fontsource-variable/readex-pro` 5.3.0, bundled and served from our own origin | https://github.com/ThomasJockin/readexpro (packaged by https://fontsource.org) | SIL Open Font License 1.1, text in `licenses/readex-pro-OFL.txt` | Thomas Jockin, Nadine Chahine, Bonnie Shaver-Troup, Font Bureau | none (woff2 subsets as packaged) |
| Phosphor Icons (MoonStars, Armchair, Trophy, Tray, UserCircle; regular and fill) | npm `@phosphor-icons/react` 2.1.10, bundled | https://github.com/phosphor-icons/react | MIT | Phosphor Icons (Tobias Fried, Helena Zhang) | none |
| Woven band | `src/components/WovenBand.tsx` | own work, drawn for this app after the banded structure of Sadu weaving; not traced from any cloth | ADC (own work) | Heimerdinger | n/a |
| Seat ring (table and seats) | `src/components/SeatRing.tsx` | own work | ADC (own work) | Heimerdinger | n/a |
| Dallah and finjan, score sheet with crown | `src/components/Art.tsx` | own work | ADC (own work) | Heimerdinger | n/a |
| App icon (table with one open seat) | `public/icon.svg` | own work | ADC (own work) | Heimerdinger | n/a |
| Google "G" logo (standard colour, light, square, Android+Web) | `public/brand/google-g.svg` | Google's official Sign in with Google asset bundle, https://developers.google.com/static/identity/images/signin-assets.zip (file `Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web.svg`) | Google brand feature, not ours: used only inside our "Sign in with Google" button as the Sign in with Google Branding Guidelines allow (https://developers.google.com/identity/branding-guidelines); never recoloured, resized away from 20px or used alone | Google LLC | viewBox cropped to the 20x20 "G" (the bundle's white tile and outline left out; our button draws Google's light/dark fill and stroke). Logo paths untouched. |

No photos, no raster images, no CDN scripts, no map tiles. The Google "G" is a vector file with no metadata. No third-party artwork: Dribbble shots in ADC-RES-50 were looked at only.
Member photos (later slice) are re-encoded in the browser through canvas before upload, which drops EXIF/GPS.
