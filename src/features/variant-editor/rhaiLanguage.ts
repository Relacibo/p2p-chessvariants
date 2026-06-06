import type { Monaco } from "@monaco-editor/react";

/** Rhai keywords as of v1.25. */
const RHAI_KEYWORDS = [
  "fn", "let", "const", "if", "else", "for", "in", "return",
  "throw", "true", "false", "switch", "case", "try", "catch",
  "continue", "break", "loop", "do", "while", "is", "type_of",
  "import", "export", "as", "private", "public",
];

/** Register a minimal Rhai language definition before Monaco mounts. */
export function registerRhaiLanguage(monaco: Monaco): void {
  monaco.languages.register({ id: "rhai" });

  monaco.languages.setMonarchTokensProvider("rhai", {
    keywords: RHAI_KEYWORDS,
    tokenizer: {
      root: [
        // line comment
        [/\/\/.*$/, "comment"],
        // block comment
        [/\/\*/, "comment", "@blockComment"],
        // strings
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@stringDouble"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/'/, "string", "@stringSingle"],
        // numbers
        [/\d+/, "number"],
        // identifiers that are keywords
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        // operators and punctuation
        [/[{}()\[\]]/, "@brackets"],
        [/[<>!=]=?/, "operator"],
        [/[+\-*/%&|^~!]=?/, "operator"],
        [/[;:.,#?]/, "delimiter"],
      ],
      blockComment: [
        [/\*\//, "comment", "@pop"],
        [/./, "comment"],
      ],
      stringDouble: [
        [/[^"\\]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      stringSingle: [
        [/[^'\\]+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration("rhai", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
}
