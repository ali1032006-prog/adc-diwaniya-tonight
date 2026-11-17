/* Own illustrations for empty states, drawn for Diwaniya Tonight (see ASSET-LICENSES.md). */

/** A dallah coffee pot pouring into a finjan: the host's welcome, used on Inbox. */
export function DallahArt() {
  return (
    <svg className="art" viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false">
      <path className="art-camel" d="M38 82h40l-4-30c-1-7-6-12-12-13h-8c-6 1-11 6-12 13z" />
      <path className="art-line" d="M50 39c0-6 2-10 8-12 6 2 8 6 8 12" fill="none" />
      <circle className="art-saffron" cx="58" cy="24" r="3" />
      <path className="art-line" d="M76 48c8-2 14-6 18-12l4 2c-3 8-10 14-20 17" fill="none" />
      <path className="art-line" d="M38 56c-7 0-11 5-11 11s4 10 11 10" fill="none" />
      <path className="art-wool" d="M92 74h16l-2 8c-1 2-2 3-4 3h-4c-2 0-3-1-4-3z" />
      <path className="art-saffron-line" d="M99 44c0 8 0 18 1 26" fill="none" strokeDasharray="2 4" />
      <path className="art-madder" d="M34 84h48v4H34z" />
    </svg>
  );
}

/** A score sheet with a crown: the season waiting for its first result, used on League. */
export function ScoreSheetArt() {
  return (
    <svg className="art" viewBox="0 0 120 96" width="120" height="96" aria-hidden="true" focusable="false">
      <rect className="art-wool" x="30" y="18" width="60" height="72" rx="6" />
      <path className="art-ink-line" d="M60 26v56M38 36h44M38 48h44M38 60h44M38 72h44" fill="none" />
      <path className="art-saffron" d="M46 6l6 6 8-8 8 8 6-6-2 14H48z" />
    </svg>
  );
}
