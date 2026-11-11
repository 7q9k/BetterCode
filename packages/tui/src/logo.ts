// "bettercode" in the block-letter style of the original OpenCode logo: four rows per letter (an ascender row, then
// three body rows). `_` is a cell in the counter's shadow, `^` a shadowed lower half, `~` a shadow under the letter.
const letters = new Map(
  Object.entries({
    b: ["▄   ", "█▀▀█", "█__█", "▀▀▀▀"],
    e: ["    ", "█▀▀█", "█^^^", "▀▀▀▀"],
    t: [" ▄  ", "▀█▀▀", " █__", " ▀▀▀"],
    r: ["    ", "█▀▀▀", "█   ", "▀   "],
    c: ["    ", "█▀▀▀", "█___", "▀▀▀▀"],
    o: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
    d: ["   ▄", "█▀▀█", "█__█", "▀▀▀▀"],
  }),
)

const word = (text: string) =>
  [0, 1, 2, 3].map((row) => [...text].map((letter) => letters.get(letter)?.[row] ?? "    ").join(" "))

export const logo = {
  left: word("better"),
  right: word("code"),
}

// The BetterCode mark: the "b" alone, for narrow terminals and one-line banners.
export const mark = letters.get("b") ?? []

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}
