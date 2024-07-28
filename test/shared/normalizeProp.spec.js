import { normalizeClass } from "../../shared/index.js";

console.log(
  normalizeClass([
    "foo bar",
    {
      baz: true,
      zsh: false,
    },
  ]) === "foo bar baz"
);
