import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, test } from 'vitest'
import { compile } from '.'
import type { PluginAPI } from './compat/plugin-api'
import plugin from './plugin'
import { compileCss, optimizeCss, run } from './test-utils/run'

const css = String.raw

describe('compiling CSS', () => {
  test('`@tailwind utilities` is replaced with the generated utility classes', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-black: #000;
            --breakpoint-md: 768px;
          }

          @layer utilities {
            @tailwind utilities;
          }
        `,
        ['flex', 'md:grid', 'hover:underline', 'dark:bg-black'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-black: #000;
        --breakpoint-md: 768px;
      }

      @layer utilities {
        .flex {
          display: flex;
        }

        @media (hover: hover) {
          .hover\\:underline:hover {
            text-decoration-line: underline;
          }
        }

        @media (width >= 768px) {
          .md\\:grid {
            display: grid;
          }
        }

        @media (prefers-color-scheme: dark) {
          .dark\\:bg-black {
            background-color: var(--color-black, #000);
          }
        }
      }"
    `)
  })

  test('that only CSS variables are allowed', () => {
    return expect(
      compileCss(
        css`
          @theme {
            --color-primary: red;
            .foo {
              --color-primary: blue;
            }
          }
          @tailwind utilities;
        `,
        ['bg-primary'],
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [Error: \`@theme\` blocks must only contain custom properties or \`@keyframes\`.

        @theme {
      >   .foo {
      >     --color-primary: blue;
      >   }
        }
        ]
    `)
  })

  test('`@tailwind utilities` is only processed once', async () => {
    expect(
      await compileCss(
        css`
          @tailwind utilities;
          @tailwind utilities;
        `,
        ['flex', 'grid'],
      ),
    ).toMatchInlineSnapshot(`
      ".flex {
        display: flex;
      }

      .grid {
        display: grid;
      }"
    `)
  })

  test('`@tailwind utilities` is replaced by utilities using the default theme', async () => {
    let defaultTheme = fs.readFileSync(path.resolve(__dirname, '..', 'theme.css'), 'utf-8')

    expect(
      await compileCss(
        css`
          ${defaultTheme}
          @tailwind utilities;
        `,
        ['bg-red-500', 'w-4', 'sm:flex', 'shadow-sm'],
      ),
    ).toMatchSnapshot()
  })

  test('unescapes underscores to spaces inside arbitrary values except for `url()` and first argument of `var()` and `theme()`', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --spacing-1_5: 1.5rem;
            --spacing-2_5: 2.5rem;
          }
          @tailwind utilities;
        `,
        [
          'bg-[no-repeat_url(./my_file.jpg)',
          'ml-[var(--spacing-1_5,_var(--spacing-2_5,_1rem))]',
          'ml-[theme(--spacing-1_5,theme(--spacing-2_5,_1rem)))]',
        ],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --spacing-1_5: 1.5rem;
        --spacing-2_5: 2.5rem;
      }

      .ml-\\[theme\\(--spacing-1_5\\,theme\\(--spacing-2_5\\,_1rem\\)\\)\\)\\] {
        margin-left: 1.5rem;
      }

      .ml-\\[var\\(--spacing-1_5\\,_var\\(--spacing-2_5\\,_1rem\\)\\)\\] {
        margin-left: var(--spacing-1_5, var(--spacing-2_5, 1rem));
      }

      .bg-\\[no-repeat_url\\(\\.\\/my_file\\.jpg\\) {
        background-color: no-repeat url("./")my file. jpg;
      }"
    `)
  })
})

describe('arbitrary properties', () => {
  it('should generate arbitrary properties', async () => {
    expect(await run(['[color:red]'])).toMatchInlineSnapshot(`
      ".\\[color\\:red\\] {
        color: red;
      }"
    `)
  })

  it('should generate arbitrary properties with modifiers', async () => {
    expect(await run(['[color:red]/50'])).toMatchInlineSnapshot(`
      ".\\[color\\:red\\]\\/50 {
        color: oklch(62.7955% .257683 29.2339 / .5);
      }"
    `)
  })

  it('should not generate arbitrary properties with invalid modifiers', async () => {
    expect(await run(['[color:red]/not-a-percentage'])).toMatchInlineSnapshot(`""`)
  })

  it('should generate arbitrary properties with variables and with modifiers', async () => {
    expect(await run(['[color:var(--my-color)]/50'])).toMatchInlineSnapshot(`
      ".\\[color\\:var\\(--my-color\\)\\]\\/50 {
        color: color-mix(in oklch, var(--my-color) 50%, transparent);
      }"
    `)
  })
})

describe('@apply', () => {
  it('@apply in @keyframes is not allowed', () => {
    return expect(() =>
      compileCss(css`
        @keyframes foo {
          0% {
            @apply bg-red-500;
          }
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: You cannot use \`@apply\` inside \`@keyframes\`.]`,
    )
  })

  it('should replace @apply with the correct result', async () => {
    expect(
      await compileCss(css`
        @theme {
          --color-red-200: #fecaca;
          --color-red-500: #ef4444;
          --color-blue-500: #3b82f6;
          --color-green-200: #bbf7d0;
          --color-green-500: #22c55e;
          --breakpoint-md: 768px;
          --animate-spin: spin 1s linear infinite;

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        }

        @tailwind utilities;

        .foo {
          @apply underline bg-red-500 hover:bg-blue-500 md:bg-green-500 animate-spin translate-x-full;

          &:hover:focus {
            @apply bg-red-200 md:bg-green-200;
          }
        }
      `),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-red-200: #fecaca;
        --color-red-500: #ef4444;
        --color-blue-500: #3b82f6;
        --color-green-200: #bbf7d0;
        --color-green-500: #22c55e;
        --breakpoint-md: 768px;
        --animate-spin: spin 1s linear infinite;
      }

      .foo {
        --tw-translate-x: 100%;
        translate: var(--tw-translate-x) var(--tw-translate-y);
        animation: var(--animate-spin, spin 1s linear infinite);
        background-color: var(--color-red-500, #ef4444);
        text-decoration-line: underline;
      }

      @media (hover: hover) {
        .foo:hover {
          background-color: var(--color-blue-500, #3b82f6);
        }
      }

      @media (width >= 768px) {
        .foo {
          background-color: var(--color-green-500, #22c55e);
        }
      }

      .foo:hover:focus {
        background-color: var(--color-red-200, #fecaca);
      }

      @media (width >= 768px) {
        .foo:hover:focus {
          background-color: var(--color-green-200, #bbf7d0);
        }
      }

      @supports (-moz-orient: inline) {
        @layer base {
          *, :before, :after, ::backdrop {
            --tw-translate-x: 0;
            --tw-translate-y: 0;
            --tw-translate-z: 0;
          }
        }
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @property --tw-translate-x {
        syntax: "<length> | <percentage>";
        inherits: false;
        initial-value: 0;
      }

      @property --tw-translate-y {
        syntax: "<length> | <percentage>";
        inherits: false;
        initial-value: 0;
      }

      @property --tw-translate-z {
        syntax: "<length>";
        inherits: false;
        initial-value: 0;
      }"
    `)
  })

  it('should replace @apply with the correct result inside imported stylesheets', async () => {
    expect(
      await compileCss(
        css`
          @import './bar.css';
          @tailwind utilities;
        `,
        [],
        {
          async loadStylesheet() {
            return {
              base: '/bar.css',
              content: css`
                .foo {
                  @apply underline;
                }
              `,
            }
          },
        },
      ),
    ).toMatchInlineSnapshot(`
      ".foo {
        text-decoration-line: underline;
      }"
    `)
  })

  it('should @apply in order the utilities would be sorted in if they were used in HTML', async () => {
    expect(
      await compileCss(css`
        @tailwind utilities;

        .foo {
          @apply content-["a"] content-["b"];
        }

        .bar {
          @apply content-["b"] content-["a"];
        }
      `),
    ).toMatchInlineSnapshot(`
      ".foo, .bar {
        --tw-content: "b";
        content: var(--tw-content);
        content: var(--tw-content);
      }

      @supports (-moz-orient: inline) {
        @layer base {
          *, :before, :after, ::backdrop {
            --tw-content: "";
          }
        }
      }

      @property --tw-content {
        syntax: "*";
        inherits: false;
        initial-value: "";
      }"
    `)
  })

  it('should error when using @apply with a utility that does not exist', () => {
    return expect(
      compileCss(css`
        @tailwind utilities;

        .foo {
          @apply bg-not-found;
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot apply unknown utility class: bg-not-found]`,
    )
  })

  it('should error when using @apply with a variant that does not exist', () => {
    return expect(
      compileCss(css`
        @tailwind utilities;

        .foo {
          @apply hocus:bg-red-500;
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot apply unknown utility class: hocus:bg-red-500]`,
    )
  })

  it('should not error with trailing whitespace', async () => {
    expect(
      await compileCss(`
        @tailwind utilities;

        .foo {
          @apply flex ;
        }
      `),
    ).toMatchInlineSnapshot(`
      ".foo {
        display: flex;
      }"
    `)
  })

  it('should be possible to apply a custom utility', async () => {
    expect(
      await compileCss(css`
        @utility bar {
          &:before {
            content: 'bar';
          }
        }

        .foo {
          /* Baz is defined after this rule, but should work */
          @apply bar baz;
        }

        @utility baz {
          &:after {
            content: 'baz';
          }
        }

        @tailwind utilities;
      `),
    ).toMatchInlineSnapshot(`
      ".foo:before {
        content: "bar";
      }

      .foo:after {
        content: "baz";
      }"
    `)
  })
})

describe('arbitrary variants', () => {
  it('should generate arbitrary variants', async () => {
    expect(await run(['[&_p]:flex'])).toMatchInlineSnapshot(`
      ".\\[\\&_p\\]\\:flex p {
        display: flex;
      }"
    `)
  })

  it('should generate arbitrary at-rule variants', async () => {
    expect(await run(['[@media(width>=123px)]:flex'])).toMatchInlineSnapshot(`
      "@media (width >= 123px) {
        .\\[\\@media\\(width\\>\\=123px\\)\\]\\:flex {
          display: flex;
        }
      }"
    `)
  })

  it('discards arbitrary variants using relative selectors', async () => {
    expect(await run(['[>img]:flex', '[+img]:flex', '[~img]:flex'])).toBe('')
  })
})

describe('variant stacking', () => {
  it('should stack simple variants', async () => {
    expect(await run(['focus:hover:flex'])).toMatchInlineSnapshot(`
      "@media (hover: hover) {
        .focus\\:hover\\:flex:focus:hover {
          display: flex;
        }
      }"
    `)
  })

  it('should stack arbitrary variants and simple variants', async () => {
    expect(await run(['[&_p]:hover:flex'])).toMatchInlineSnapshot(`
      "@media (hover: hover) {
        .\\[\\&_p\\]\\:hover\\:flex p:hover {
          display: flex;
        }
      }"
    `)
  })

  it('should stack multiple arbitrary variants', async () => {
    expect(await run(['[&_p]:[@media(width>=123px)]:flex'])).toMatchInlineSnapshot(`
      "@media (width >= 123px) {
        .\\[\\&_p\\]\\:\\[\\@media\\(width\\>\\=123px\\)\\]\\:flex p {
          display: flex;
        }
      }"
    `)
  })

  it('pseudo element variants are re-ordered', async () => {
    expect(await run(['before:hover:flex', 'hover:before:flex'])).toMatchInlineSnapshot(`
      ".before\\:hover\\:flex:before {
        content: var(--tw-content);
      }

      @media (hover: hover) {
        .before\\:hover\\:flex:before:hover {
          display: flex;
        }
      }

      @media (hover: hover) {
        .hover\\:before\\:flex:hover:before {
          content: var(--tw-content);
          display: flex;
        }
      }

      @supports (-moz-orient: inline) {
        @layer base {
          *, :before, :after, ::backdrop {
            --tw-content: "";
          }
        }
      }

      @property --tw-content {
        syntax: "*";
        inherits: false;
        initial-value: "";
      }"
    `)
  })
})

describe('important', () => {
  it('should generate an important utility', async () => {
    expect(await run(['underline!'])).toMatchInlineSnapshot(`
      ".underline\\! {
        text-decoration-line: underline !important;
      }"
    `)
  })

  it('should generate an important utility with legacy syntax', async () => {
    expect(await run(['!underline'])).toMatchInlineSnapshot(`
      ".\\!underline {
        text-decoration-line: underline !important;
      }"
    `)
  })

  it('should not mark declarations inside of @keyframes as important', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --animate-spin: spin 1s linear infinite;

            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          }
          @tailwind utilities;
        `,
        ['animate-spin!'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --animate-spin: spin 1s linear infinite;
      }

      .animate-spin\\! {
        animation: var(--animate-spin, spin 1s linear infinite) !important;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }"
    `)
  })

  it('should generate an important arbitrary property utility', async () => {
    expect(await run(['[color:red]!'])).toMatchInlineSnapshot(`
      ".\\[color\\:red\\]\\! {
        color: red !important;
      }"
    `)
  })
})

describe('sorting', () => {
  it('should sort utilities based on their property order', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --spacing-1: 0.25rem;
          }
          @tailwind utilities;
        `,
        ['pointer-events-none', 'flex', 'p-1', 'px-1', 'pl-1'].sort(() => Math.random() - 0.5),
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --spacing-1: .25rem;
      }

      .pointer-events-none {
        pointer-events: none;
      }

      .flex {
        display: flex;
      }

      .p-1 {
        padding: var(--spacing-1, .25rem);
      }

      .px-1 {
        padding-inline: var(--spacing-1, .25rem);
      }

      .pl-1 {
        padding-left: var(--spacing-1, .25rem);
      }"
    `)
  })

  it('should sort based on amount of properties', async () => {
    expect(await run(['text-clip', 'truncate', 'overflow-scroll'])).toMatchInlineSnapshot(`
      ".truncate {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
      }

      .overflow-scroll {
        overflow: scroll;
      }

      .text-clip {
        text-overflow: clip;
      }"
    `)
  })

  /**
   * Space utilities are implemented using margin, but they act more like a
   * polyfill for gap. This means that they should be sorted near gap, not
   * margin.
   */
  it('should sort utilities with a custom internal --tw-sort correctly', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --spacing-0: 0px;
            --spacing-2: 0.5rem;
            --spacing-4: 1rem;
          }
          @tailwind utilities;
        `,
        ['mx-0', 'gap-4', 'space-x-2'].sort(() => Math.random() - 0.5),
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --spacing-0: 0px;
        --spacing-2: .5rem;
        --spacing-4: 1rem;
      }

      .mx-0 {
        margin-inline: var(--spacing-0, 0px);
      }

      .gap-4 {
        gap: var(--spacing-4, 1rem);
      }

      :where(.space-x-2 > :not(:last-child)) {
        margin-inline-start: calc(var(--spacing-2, .5rem) * var(--tw-space-x-reverse));
        margin-inline-end: calc(var(--spacing-2, .5rem) * calc(1 - var(--tw-space-x-reverse)));
      }

      @supports (-moz-orient: inline) {
        @layer base {
          *, :before, :after, ::backdrop {
            --tw-space-x-reverse: 0;
          }
        }
      }

      @property --tw-space-x-reverse {
        syntax: "<number>";
        inherits: false;
        initial-value: 0;
      }"
    `)
  })

  it('should sort individual logical properties later than left/right pairs', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --spacing-1: 1px;
            --spacing-2: 2px;
            --spacing-3: 3px;
          }
          @tailwind utilities;
        `,
        [
          // scroll-margin
          'scroll-ms-1',
          'scroll-me-2',
          'scroll-mx-3',

          // scroll-padding
          'scroll-ps-1',
          'scroll-pe-2',
          'scroll-px-3',

          // margin
          'ms-1',
          'me-2',
          'mx-3',

          // padding
          'ps-1',
          'pe-2',
          'px-3',
        ].sort(() => Math.random() - 0.5),
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --spacing-1: 1px;
        --spacing-2: 2px;
        --spacing-3: 3px;
      }

      .mx-3 {
        margin-inline: var(--spacing-3, 3px);
      }

      .ms-1 {
        margin-inline-start: var(--spacing-1, 1px);
      }

      .me-2 {
        margin-inline-end: var(--spacing-2, 2px);
      }

      .scroll-mx-3 {
        scroll-margin-inline: var(--spacing-3, 3px);
      }

      .scroll-ms-1 {
        scroll-margin-inline-start: var(--spacing-1, 1px);
      }

      .scroll-me-2 {
        scroll-margin-inline-end: var(--spacing-2, 2px);
      }

      .scroll-px-3 {
        scroll-padding-inline: var(--spacing-3, 3px);
      }

      .scroll-ps-1 {
        scroll-padding-inline-start: var(--spacing-1, 1px);
      }

      .scroll-pe-2 {
        scroll-padding-inline-end: var(--spacing-2, 2px);
      }

      .px-3 {
        padding-inline: var(--spacing-3, 3px);
      }

      .ps-1 {
        padding-inline-start: var(--spacing-1, 1px);
      }

      .pe-2 {
        padding-inline-end: var(--spacing-2, 2px);
      }"
    `)
  })

  it('should move variants to the end while sorting', async () => {
    expect(
      await run(
        ['pointer-events-none', 'flex', 'hover:flex', 'focus:pointer-events-none'].sort(
          () => Math.random() - 0.5,
        ),
      ),
    ).toMatchInlineSnapshot(`
      ".pointer-events-none {
        pointer-events: none;
      }

      .flex {
        display: flex;
      }

      @media (hover: hover) {
        .hover\\:flex:hover {
          display: flex;
        }
      }

      .focus\\:pointer-events-none:focus {
        pointer-events: none;
      }"
    `)
  })

  /**
   * Every variant should be sorted by its position in the variant list. Every
   * combination of variants that exist before the current variant should always
   * be sorted before the current variant.
   *
   * Given the following list of variants:
   * 1. `hover`
   * 2. `focus`
   * 3. `disabled`
   *
   * This means that `hover` should be before `focus`, `focus` should be before
   * `disabled`. This also means that the combination of `hover` and `focus`
   * (stacked variants) should be before `disabled` because all used variants
   * are defined before the `disabled` variant.
   */
  it('should sort variants and stacked variants by variant position', async () => {
    expect(
      await run(
        ['flex', 'hover:flex', 'focus:flex', 'disabled:flex', 'hover:focus:flex'].sort(
          () => Math.random() - 0.5,
        ),
      ),
    ).toMatchInlineSnapshot(`
      ".flex {
        display: flex;
      }

      @media (hover: hover) {
        .hover\\:flex:hover {
          display: flex;
        }
      }

      .focus\\:flex:focus {
        display: flex;
      }

      @media (hover: hover) {
        .hover\\:focus\\:flex:hover:focus {
          display: flex;
        }
      }

      .disabled\\:flex:disabled {
        display: flex;
      }"
    `)
  })

  // TODO: Extend this test with user-defined variants to ensure they are sorted
  // correctly.
  it('should order group-* and peer-* variants based on the sort order of the group and peer variant but also based on the variant they are wrapping', async () => {
    expect(
      await run(
        [
          'hover:flex',

          'group-hover:flex',
          'group-focus:flex',

          'peer-hover:flex',
          'peer-focus:flex',

          'group-hover:peer-hover:flex',
          'group-hover:peer-focus:flex',
          'peer-hover:group-hover:flex',
          'peer-hover:group-focus:flex',
          'group-focus:peer-hover:flex',
          'group-focus:peer-focus:flex',
          'peer-focus:group-hover:flex',
          'peer-focus:group-focus:flex',
        ].sort(() => Math.random() - 0.5),
      ),
    ).toMatchInlineSnapshot(`
      "@media (hover: hover) {
        .group-hover\\:flex:is(:where(.group):hover *) {
          display: flex;
        }
      }

      .group-focus\\:flex:is(:where(.group):focus *) {
        display: flex;
      }

      @media (hover: hover) {
        .peer-hover\\:flex:is(:where(.peer):hover ~ *) {
          display: flex;
        }
      }

      @media (hover: hover) {
        @media (hover: hover) {
          .group-hover\\:peer-hover\\:flex:is(:where(.group):hover *):is(:where(.peer):hover ~ *) {
            display: flex;
          }
        }
      }

      @media (hover: hover) {
        @media (hover: hover) {
          .peer-hover\\:group-hover\\:flex:is(:where(.peer):hover ~ *):is(:where(.group):hover *) {
            display: flex;
          }
        }
      }

      @media (hover: hover) {
        .group-focus\\:peer-hover\\:flex:is(:where(.group):focus *):is(:where(.peer):hover ~ *) {
          display: flex;
        }
      }

      @media (hover: hover) {
        .peer-hover\\:group-focus\\:flex:is(:where(.peer):hover ~ *):is(:where(.group):focus *) {
          display: flex;
        }
      }

      .peer-focus\\:flex:is(:where(.peer):focus ~ *) {
        display: flex;
      }

      @media (hover: hover) {
        .group-hover\\:peer-focus\\:flex:is(:where(.group):hover *):is(:where(.peer):focus ~ *) {
          display: flex;
        }
      }

      @media (hover: hover) {
        .peer-focus\\:group-hover\\:flex:is(:where(.peer):focus ~ *):is(:where(.group):hover *) {
          display: flex;
        }
      }

      .group-focus\\:peer-focus\\:flex:is(:where(.group):focus *):is(:where(.peer):focus ~ *) {
        display: flex;
      }

      .peer-focus\\:group-focus\\:flex:is(:where(.peer):focus ~ *):is(:where(.group):focus *) {
        display: flex;
      }

      @media (hover: hover) {
        .hover\\:flex:hover {
          display: flex;
        }
      }"
    `)
  })
})

// Parsing theme values from CSS
describe('Parsing themes values from CSS', () => {
  test('Can read values from `@theme`', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-red-500: #f00;
          }
          @tailwind utilities;
        `,
        ['accent-red-500'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-red-500: red;
      }

      .accent-red-500 {
        accent-color: var(--color-red-500, red);
      }"
    `)
  })

  test('Later values from `@theme` override earlier ones', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-red-500: #f00;
            --color-red-500: #f10;
          }
          @tailwind utilities;
        `,
        ['accent-red-500'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-red-500: #f10;
      }

      .accent-red-500 {
        accent-color: var(--color-red-500, #f10);
      }"
    `)
  })

  test('Multiple `@theme` blocks are merged', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-red-500: #f00;
          }
          @theme {
            --color-blue-500: #00f;
          }
          @tailwind utilities;
        `,
        ['accent-red-500', 'accent-blue-500'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-red-500: red;
        --color-blue-500: #00f;
      }

      .accent-blue-500 {
        accent-color: var(--color-blue-500, #00f);
      }

      .accent-red-500 {
        accent-color: var(--color-red-500, red);
      }"
    `)
  })

  test('`@theme` values with escaped forward slashes map to unescaped slashes in candidate values', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            /* Cursed but we want this to work */
            --width-1\/2: 75%;
            --width-75\%: 50%;
          }
          @tailwind utilities;
        `,
        ['w-1/2', 'w-75%'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --width-1\\/2: 75%;
        --width-75\\%: 50%;
      }

      .w-1\\/2 {
        width: var(--width-1\\/2, 75%);
      }

      .w-75\\% {
        width: var(--width-75\\%, 50%);
      }"
    `)
  })

  test('`@keyframes` in `@theme` are hoisted', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-red: red;
            --animate-foo: foo 1s infinite;

            @keyframes foo {
              to {
                opacity: 1;
              }
            }

            --font-size-lg: 20px;
          }
          @tailwind utilities;
        `,
        ['accent-red', 'text-lg'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-red: red;
        --animate-foo: foo 1s infinite;
        --font-size-lg: 20px;
      }

      .text-lg {
        font-size: var(--font-size-lg, 20px);
      }

      .accent-red {
        accent-color: var(--color-red, red);
      }

      @keyframes foo {
        to {
          opacity: 1;
        }
      }"
    `)
  })

  test('`@theme` values can be unset', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-red: #f00;
            --color-blue: #00f;
            --font-size-sm: 13px;
            --font-size-md: 16px;

            --animate-spin: spin 1s infinite linear;

            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          }
          @theme {
            --color-*: initial;
            --font-size-md: initial;
            --animate-*: initial;
            --keyframes-*: initial;
          }
          @theme {
            --color-green: #0f0;
          }
          @tailwind utilities;
        `,
        ['accent-red', 'accent-blue', 'accent-green', 'text-sm', 'text-md'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --font-size-sm: 13px;
        --color-green: #0f0;
      }

      .text-sm {
        font-size: var(--font-size-sm, 13px);
      }

      .accent-green {
        accent-color: var(--color-green, #0f0);
      }"
    `)
  })

  test('all `@theme` values can be unset at once', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-red: #f00;
            --color-blue: #00f;
            --font-size-sm: 13px;
            --font-size-md: 16px;
          }
          @theme {
            --*: initial;
          }
          @theme {
            --color-green: #0f0;
          }
          @tailwind utilities;
        `,
        ['accent-red', 'accent-blue', 'accent-green', 'text-sm', 'text-md'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-green: #0f0;
      }

      .accent-green {
        accent-color: var(--color-green, #0f0);
      }"
    `)
  })

  test('unused keyframes are removed when an animation is unset', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --animate-foo: foo 1s infinite;
            --animate-foobar: foobar 1s infinite;

            @keyframes foo {
              to {
                opacity: 1;
              }
            }

            @keyframes foobar {
              to {
                opacity: 0;
              }
            }
          }
          @theme {
            --animate-foo: initial;
          }
          @tailwind utilities;
        `,
        ['animate-foo', 'animate-foobar'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --animate-foobar: foobar 1s infinite;
      }

      .animate-foobar {
        animation: var(--animate-foobar, foobar 1s infinite);
      }

      @keyframes foobar {
        to {
          opacity: 0;
        }
      }"
    `)
  })

  test('theme values added as reference are not included in the output as variables', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-tomato: #e10c04;
          }
          @theme reference {
            --color-potato: #ac855b;
          }
          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-tomato: #e10c04;
      }

      .bg-potato {
        background-color: var(--color-potato, #ac855b);
      }

      .bg-tomato {
        background-color: var(--color-tomato, #e10c04);
      }"
    `)
  })

  test('theme values added as reference that override existing theme value suppress the output of the original theme value as a variable', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-potato: #ac855b;
          }
          @theme reference {
            --color-potato: #c794aa;
          }
          @tailwind utilities;
        `,
        ['bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ".bg-potato {
        background-color: var(--color-potato, #c794aa);
      }"
    `)
  })

  test('overriding a reference theme value with a non-reference theme value includes it in the output as a variable', async () => {
    expect(
      await compileCss(
        css`
          @theme reference {
            --color-potato: #ac855b;
          }
          @theme {
            --color-potato: #c794aa;
          }
          @tailwind utilities;
        `,
        ['bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-potato: #c794aa;
      }

      .bg-potato {
        background-color: var(--color-potato, #c794aa);
      }"
    `)
  })

  test('wrapping `@theme` with `@media reference` behaves like `@theme reference` to support `@import` statements', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-tomato: #e10c04;
          }
          @media theme(reference) {
            @theme {
              --color-potato: #ac855b;
            }
            @theme {
              --color-avocado: #c0cc6d;
            }
          }
          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato', 'bg-avocado'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-tomato: #e10c04;
      }

      .bg-avocado {
        background-color: var(--color-avocado, #c0cc6d);
      }

      .bg-potato {
        background-color: var(--color-potato, #ac855b);
      }

      .bg-tomato {
        background-color: var(--color-tomato, #e10c04);
      }"
    `)
  })

  test('`@media theme(…)` can only contain `@theme` rules', () => {
    return expect(
      compileCss(
        css`
          @media theme(reference) {
            .not-a-theme-rule {
              color: cursed;
            }
          }
          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato', 'bg-avocado'],
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: Files imported with \`@import "…" theme(…)\` must only contain \`@theme\` blocks.]`,
    )
  })

  test('theme values added as `inline` are not wrapped in `var(…)` when used as utility values', async () => {
    expect(
      await compileCss(
        css`
          @theme inline {
            --color-tomato: #e10c04;
            --color-potato: #ac855b;
            --color-primary: var(--primary);
          }

          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato', 'bg-primary'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-tomato: #e10c04;
        --color-potato: #ac855b;
        --color-primary: var(--primary);
      }

      .bg-potato {
        background-color: #ac855b;
      }

      .bg-primary {
        background-color: var(--primary);
      }

      .bg-tomato {
        background-color: #e10c04;
      }"
    `)
  })

  test('wrapping `@theme` with `@media theme(inline)` behaves like `@theme inline` to support `@import` statements', async () => {
    expect(
      await compileCss(
        css`
          @media theme(inline) {
            @theme {
              --color-tomato: #e10c04;
              --color-potato: #ac855b;
              --color-primary: var(--primary);
            }
          }

          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato', 'bg-primary'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-tomato: #e10c04;
        --color-potato: #ac855b;
        --color-primary: var(--primary);
      }

      .bg-potato {
        background-color: #ac855b;
      }

      .bg-primary {
        background-color: var(--primary);
      }

      .bg-tomato {
        background-color: #e10c04;
      }"
    `)
  })

  test('`inline` and `reference` can be used together', async () => {
    expect(
      await compileCss(
        css`
          @theme reference inline {
            --color-tomato: #e10c04;
            --color-potato: #ac855b;
            --color-primary: var(--primary);
          }

          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato', 'bg-primary'],
      ),
    ).toMatchInlineSnapshot(`
      ".bg-potato {
        background-color: #ac855b;
      }

      .bg-primary {
        background-color: var(--primary);
      }

      .bg-tomato {
        background-color: #e10c04;
      }"
    `)
  })

  test('`inline` and `reference` can be used together in `media(…)`', async () => {
    expect(
      await compileCss(
        css`
          @media theme(reference inline) {
            @theme {
              --color-tomato: #e10c04;
              --color-potato: #ac855b;
              --color-primary: var(--primary);
            }
          }

          @tailwind utilities;
        `,
        ['bg-tomato', 'bg-potato', 'bg-primary'],
      ),
    ).toMatchInlineSnapshot(`
      ".bg-potato {
        background-color: #ac855b;
      }

      .bg-primary {
        background-color: var(--primary);
      }

      .bg-tomato {
        background-color: #e10c04;
      }"
    `)
  })

  test('`default` theme values can be overridden by regular theme values`', async () => {
    expect(
      await compileCss(
        css`
          @theme {
            --color-potato: #ac855b;
          }
          @theme default {
            --color-potato: #efb46b;
          }

          @tailwind utilities;
        `,
        ['bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-potato: #ac855b;
      }

      .bg-potato {
        background-color: var(--color-potato, #ac855b);
      }"
    `)
  })

  test('`default` and `inline` can be used together', async () => {
    expect(
      await compileCss(
        css`
          @theme default inline {
            --color-potato: #efb46b;
          }

          @tailwind utilities;
        `,
        ['bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-potato: #efb46b;
      }

      .bg-potato {
        background-color: #efb46b;
      }"
    `)
  })

  test('`default` and `reference` can be used together', async () => {
    expect(
      await compileCss(
        css`
          @theme default reference {
            --color-potato: #efb46b;
          }

          @tailwind utilities;
        `,
        ['bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ".bg-potato {
        background-color: var(--color-potato, #efb46b);
      }"
    `)
  })

  test('`default`, `inline`, and `reference` can be used together', async () => {
    expect(
      await compileCss(
        css`
          @theme default reference inline {
            --color-potato: #efb46b;
          }

          @tailwind utilities;
        `,
        ['bg-potato'],
      ),
    ).toMatchInlineSnapshot(`
      ".bg-potato {
        background-color: #efb46b;
      }"
    `)
  })

  test('`default` can be used in `media(…)`', async () => {
    expect(
      await compileCss(
        css`
          @media theme() {
            @theme {
              --color-potato: #ac855b;
            }
          }
          @media theme(default) {
            @theme {
              --color-potato: #efb46b;
              --color-tomato: tomato;
            }
          }

          @tailwind utilities;
        `,
        ['bg-potato', 'bg-tomato'],
      ),
    ).toMatchInlineSnapshot(`
      ":root {
        --color-potato: #ac855b;
        --color-tomato: tomato;
      }

      .bg-potato {
        background-color: var(--color-potato, #ac855b);
      }

      .bg-tomato {
        background-color: var(--color-tomato, tomato);
      }"
    `)
  })

  test('`default` theme values can be overridden by plugin theme values', async () => {
    let { build } = await compile(
      css`
        @theme default {
          --color-red: red;
        }
        @theme {
          --color-orange: orange;
        }
        @plugin "my-plugin";
        @tailwind utilities;
      `,
      {
        loadModule: async () => {
          return {
            module: plugin(({}) => {}, {
              theme: {
                extend: {
                  colors: {
                    red: 'tomato',
                    orange: '#f28500',
                  },
                },
              },
            }),
            base: '/root',
          }
        },
      },
    )

    expect(optimizeCss(build(['text-red', 'text-orange'])).trim()).toMatchInlineSnapshot(`
      ":root {
        --color-orange: orange;
      }

      .text-orange {
        color: var(--color-orange, orange);
      }

      .text-red {
        color: tomato;
      }"
    `)
  })

  test('`default` theme values can be overridden by config theme values', async () => {
    let { build } = await compile(
      css`
        @theme default {
          --color-red: red;
        }
        @theme {
          --color-orange: orange;
        }
        @config "./my-config.js";
        @tailwind utilities;
      `,
      {
        loadModule: async () => {
          return {
            module: {
              theme: {
                extend: {
                  colors: {
                    red: 'tomato',
                    orange: '#f28500',
                  },
                },
              },
            },
            base: '/root',
          }
        },
      },
    )

    expect(optimizeCss(build(['text-red', 'text-orange'])).trim()).toMatchInlineSnapshot(`
      ":root {
        --color-orange: orange;
      }

      .text-orange {
        color: var(--color-orange, orange);
      }

      .text-red {
        color: tomato;
      }"
    `)
  })
})

describe('plugins', () => {
  test('@plugin need a path', () => {
    return expect(
      compile(
        css`
          @plugin;
        `,
        {
          loadModule: async () => ({
            module: ({ addVariant }: PluginAPI) => {
              addVariant('hocus', '&:hover, &:focus')
            },
            base: '/root',
          }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`@plugin\` must have a path.]`)
  })

  test('@plugin can not have an empty path', () => {
    return expect(
      compile(
        css`
          @plugin '';
        `,
        {
          loadModule: async () => ({
            module: ({ addVariant }: PluginAPI) => {
              addVariant('hocus', '&:hover, &:focus')
            },
            base: '/root',
          }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`@plugin\` must have a path.]`)
  })

  test('@plugin cannot be nested.', () => {
    return expect(
      compile(
        css`
          div {
            @plugin "my-plugin";
          }
        `,
        {
          loadModule: async () => ({
            module: ({ addVariant }: PluginAPI) => {
              addVariant('hocus', '&:hover, &:focus')
            },
            base: '/root',
          }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`@plugin\` cannot be nested.]`)
  })

  test('@plugin can accept options', async () => {
    expect.hasAssertions()

    let { build } = await compile(
      css`
        @tailwind utilities;
        @plugin "my-plugin" {
          color: red;
        }
      `,
      {
        loadModule: async () => ({
          module: plugin.withOptions((options) => {
            expect(options).toEqual({
              color: 'red',
            })

            return ({ addUtilities }) => {
              addUtilities({
                '.text-primary': {
                  color: options.color,
                },
              })
            }
          }),
          base: '/root',
        }),
      },
    )

    let compiled = build(['text-primary'])

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      ".text-primary {
        color: red;
      }"
    `)
  })

  test('@plugin options can be null, booleans, string, numbers, or arrays including those types', async () => {
    expect.hasAssertions()

    await compile(
      css`
        @tailwind utilities;
        @plugin "my-plugin" {
          is-null: null;
          is-true: true;
          is-false: false;
          is-int: 1234567;
          is-float: 1.35;
          is-sci: 1.35e-5;
          is-str-null: 'null';
          is-str-true: 'true';
          is-str-false: 'false';
          is-str-int: '1234567';
          is-str-float: '1.35';
          is-str-sci: '1.35e-5';
          is-arr: foo, bar;
          is-arr-mixed: null, true, false, 1234567, 1.35, foo, 'bar', 'true';
        }
      `,
      {
        loadModule: async () => ({
          module: plugin.withOptions((options) => {
            expect(options).toEqual({
              'is-null': null,
              'is-true': true,
              'is-false': false,
              'is-int': 1234567,
              'is-float': 1.35,
              'is-sci': 1.35e-5,
              'is-str-null': 'null',
              'is-str-true': 'true',
              'is-str-false': 'false',
              'is-str-int': '1234567',
              'is-str-float': '1.35',
              'is-str-sci': '1.35e-5',
              'is-arr': ['foo', 'bar'],
              'is-arr-mixed': [null, true, false, 1234567, 1.35, 'foo', 'bar', 'true'],
            })

            return () => {}
          }),
          base: '/root',
        }),
      },
    )
  })

  test('@plugin options can only be simple key/value pairs', () => {
    return expect(
      compile(
        css`
          @plugin "my-plugin" {
            color: red;
            sizes {
              sm: 1rem;
              md: 2rem;
            }
          }
        `,
        {
          loadModule: async () => ({
            module: plugin.withOptions((options) => {
              return ({ addUtilities }) => {
                addUtilities({
                  '.text-primary': {
                    color: options.color,
                  },
                })
              }
            }),
            base: '/root',
          }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `
      [Error: Unexpected \`@plugin\` option:

      sizes {
        sm: 1rem;
        md: 2rem;
      }


      \`@plugin\` options must be a flat list of declarations.]
    `,
    )
  })

  test('@plugin options can only be provided to plugins using withOptions', () => {
    return expect(
      compile(
        css`
          @plugin "my-plugin" {
            color: red;
          }
        `,
        {
          loadModule: async () => ({
            module: plugin(({ addUtilities }) => {
              addUtilities({
                '.text-primary': {
                  color: 'red',
                },
              })
            }),
            base: '/root',
          }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: The plugin "my-plugin" does not accept options]`,
    )
  })

  test('@plugin errors on array-like syntax', () => {
    return expect(
      compile(
        css`
          @plugin "my-plugin" {
            --color: [ 'red', 'green', 'blue'];
          }
        `,
        {
          loadModule: async () => ({ module: plugin(() => {}), base: '/root' }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: The plugin "my-plugin" does not accept options]`,
    )
  })

  test('@plugin errors on object-like syntax', () => {
    return expect(
      compile(
        css`
          @plugin "my-plugin" {
            --color: {
              red: 100;
              green: 200;
              blue: 300;
            };
          }
        `,
        {
          loadModule: async () => ({ module: plugin(() => {}), base: '/root' }),
        },
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
      [Error: Unexpected \`@plugin\` option: Value of declaration \`--color: {
                    red: 100;
                    green: 200;
                    blue: 300;
                  };\` is not supported.

      Using an object as a plugin option is currently only supported in JavaScript configuration files.]
    `)
  })

  test('addVariant with string selector', async () => {
    let { build } = await compile(
      css`
        @plugin "my-plugin";
        @layer utilities {
          @tailwind utilities;
        }
      `,
      {
        loadModule: async () => ({
          module: ({ addVariant }: PluginAPI) => {
            addVariant('hocus', '&:hover, &:focus')
          },
          base: '/root',
        }),
      },
    )
    let compiled = build(['hocus:underline', 'group-hocus:flex'])

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      "@layer utilities {
        .group-hocus\\:flex:is(:is(:where(.group):hover, :where(.group):focus) *) {
          display: flex;
        }

        .hocus\\:underline:hover, .hocus\\:underline:focus {
          text-decoration-line: underline;
        }
      }"
    `)
  })

  test('addVariant with array of selectors', async () => {
    let { build } = await compile(
      css`
        @plugin "my-plugin";
        @layer utilities {
          @tailwind utilities;
        }
      `,
      {
        loadModule: async () => ({
          module: ({ addVariant }: PluginAPI) => {
            addVariant('hocus', ['&:hover', '&:focus'])
          },
          base: '/root',
        }),
      },
    )

    let compiled = build(['hocus:underline', 'group-hocus:flex'])

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      "@layer utilities {
        .group-hocus\\:flex:is(:where(.group):hover *), .group-hocus\\:flex:is(:where(.group):focus *) {
          display: flex;
        }

        .hocus\\:underline:hover, .hocus\\:underline:focus {
          text-decoration-line: underline;
        }
      }"
    `)
  })

  test('addVariant with object syntax and @slot', async () => {
    let { build } = await compile(
      css`
        @plugin "my-plugin";
        @layer utilities {
          @tailwind utilities;
        }
      `,
      {
        loadModule: async () => ({
          module: ({ addVariant }: PluginAPI) => {
            addVariant('hocus', {
              '&:hover': '@slot',
              '&:focus': '@slot',
            })
          },
          base: '/root',
        }),
      },
    )
    let compiled = build(['hocus:underline', 'group-hocus:flex'])

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      "@layer utilities {
        .group-hocus\\:flex:is(:where(.group):hover *), .group-hocus\\:flex:is(:where(.group):focus *) {
          display: flex;
        }

        .hocus\\:underline:hover, .hocus\\:underline:focus {
          text-decoration-line: underline;
        }
      }"
    `)
  })

  test('addVariant with object syntax, media, nesting and multiple @slot', async () => {
    let { build } = await compile(
      css`
        @plugin "my-plugin";
        @layer utilities {
          @tailwind utilities;
        }
      `,
      {
        loadModule: async () => ({
          module: ({ addVariant }: PluginAPI) => {
            addVariant('hocus', {
              '@media (hover: hover)': {
                '&:hover': '@slot',
              },
              '&:focus': '@slot',
            })
          },
          base: '/root',
        }),
      },
    )
    let compiled = build(['hocus:underline', 'group-hocus:flex'])

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      "@layer utilities {
        @media (hover: hover) {
          .group-hocus\\:flex:is(:where(.group):hover *) {
            display: flex;
          }
        }

        .group-hocus\\:flex:is(:where(.group):focus *) {
          display: flex;
        }

        @media (hover: hover) {
          .hocus\\:underline:hover {
            text-decoration-line: underline;
          }
        }

        .hocus\\:underline:focus {
          text-decoration-line: underline;
        }
      }"
    `)
  })

  test('@slot is preserved when used as a custom property value', async () => {
    let { build } = await compile(
      css`
        @plugin "my-plugin";
        @layer utilities {
          @tailwind utilities;
        }
      `,
      {
        loadModule: async () => ({
          module: ({ addVariant }: PluginAPI) => {
            addVariant('hocus', {
              '&': {
                '--custom-property': '@slot',
                '&:hover': '@slot',
                '&:focus': '@slot',
              },
            })
          },
          base: '/root',
        }),
      },
    )
    let compiled = build(['hocus:underline'])

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      "@layer utilities {
        .hocus\\:underline {
          --custom-property: @slot;
        }

        .hocus\\:underline:hover, .hocus\\:underline:focus {
          text-decoration-line: underline;
        }
      }"
    `)
  })

  test('built-in variants can be overridden while keeping their order', async () => {
    let { build } = await compile(
      css`
        @plugin "my-plugin";
        @layer utilities {
          @tailwind utilities;
        }
      `,
      {
        loadModule: async () => ({
          module: ({ addVariant }: PluginAPI) => {
            addVariant('dark', '&:is([data-theme=dark] *)')
          },
          base: '/root',
        }),
      },
    )
    let compiled = build(
      // Make sure the order does not change by including the variants
      // immediately before and after `dark`
      ['rtl:flex', 'dark:flex', 'starting:flex'],
    )

    expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
      "@layer utilities {
        .rtl\\:flex:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) {
          display: flex;
        }

        .dark\\:flex:is([data-theme="dark"] *) {
          display: flex;
        }

        @starting-style {
          .starting\\:flex {
            display: flex;
          }
        }
      }"
    `)
  })
})

describe('@source', () => {
  test('emits @source files', async () => {
    let { globs } = await compile(
      css`
        @source "./foo/bar/*.ts";
      `,
      { base: '/root' },
    )

    expect(globs).toEqual([{ pattern: './foo/bar/*.ts', base: '/root' }])
  })

  test('emits multiple @source files', async () => {
    let { globs } = await compile(
      css`
        @source "./foo/**/*.ts";
        @source "./php/secr3t/smarty.php";
      `,
      { base: '/root' },
    )

    expect(globs).toEqual([
      { pattern: './foo/**/*.ts', base: '/root' },
      { pattern: './php/secr3t/smarty.php', base: '/root' },
    ])
  })
})

describe('@variant', () => {
  test('@variant must be top-level and cannot be nested', () => {
    return expect(
      compileCss(css`
        .foo {
          @variant hocus (&:hover, &:focus);
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`@variant\` cannot be nested.]`)
  })

  test('@variant with no body must include a selector', () => {
    return expect(
      compileCss(css`
        @variant hocus;
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '[Error: `@variant hocus` has no selector or body.]',
    )
  })

  test('@variant with selector must include a body', () => {
    return expect(
      compileCss(css`
        @variant hocus {
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '[Error: `@variant hocus` has no selector or body.]',
    )
  })

  test('@variant cannot have both a selector and a body', () => {
    return expect(
      compileCss(css`
        @variant hocus (&:hover, &:focus) {
          &:is(.potato) {
            @slot;
          }
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: \`@variant hocus\` cannot have both a selector and a body.]`,
    )
  })

  describe('body-less syntax', () => {
    test('selector variant', async () => {
      let { build } = await compile(css`
        @variant hocus (&:hover, &:focus);

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['hocus:underline', 'group-hocus:flex'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          .group-hocus\\:flex:is(:is(:where(.group):hover, :where(.group):focus) *) {
            display: flex;
          }

          .hocus\\:underline:hover, .hocus\\:underline:focus {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('at-rule variant', async () => {
      let { build } = await compile(css`
        @variant any-hover (@media (any-hover: hover));

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['any-hover:hover:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (any-hover: hover) {
            @media (hover: hover) {
              .any-hover\\:hover\\:underline:hover {
                text-decoration-line: underline;
              }
            }
          }
        }"
      `)
    })

    test('style-rules and at-rules', async () => {
      let { build } = await compile(css`
        @variant cant-hover (&:not(:hover), &:not(:active), @media not (any-hover: hover), @media not (pointer: fine));

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['cant-hover:focus:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          :is(.cant-hover\\:focus\\:underline:not(:hover), .cant-hover\\:focus\\:underline:not(:active)):focus {
            text-decoration-line: underline;
          }

          @media not (any-hover: hover) {
            .cant-hover\\:focus\\:underline:focus {
              text-decoration-line: underline;
            }
          }

          @media not (pointer: fine) {
            .cant-hover\\:focus\\:underline:focus {
              text-decoration-line: underline;
            }
          }
        }"
      `)
    })
  })

  describe('body with @slot syntax', () => {
    test('selector with @slot', async () => {
      let { build } = await compile(css`
        @variant selected {
          &[data-selected] {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['selected:underline', 'group-selected:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          .group-selected\\:underline:is(:where(.group)[data-selected] *) {
            text-decoration-line: underline;
          }

          .selected\\:underline[data-selected] {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('grouped selectors with @slot', async () => {
      let { build } = await compile(css`
        @variant hocus {
          &:hover,
          &:focus {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['hocus:underline', 'group-hocus:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          .group-hocus\\:underline:is(:is(:where(.group):hover, :where(.group):focus) *) {
            text-decoration-line: underline;
          }

          .hocus\\:underline:hover, .hocus\\:underline:focus {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('multiple selectors with @slot', async () => {
      let { build } = await compile(css`
        @variant hocus {
          &:hover {
            @slot;
          }

          &:focus {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['hocus:underline', 'group-hocus:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          .group-hocus\\:underline:is(:where(.group):hover *), .group-hocus\\:underline:is(:where(.group):focus *) {
            text-decoration-line: underline;
          }

          .hocus\\:underline:hover, .hocus\\:underline:focus {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('nested selector with @slot', async () => {
      let { build } = await compile(css`
        @variant custom-before {
          & {
            --has-before: 1;
            &::before {
              @slot;
            }
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['custom-before:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          .custom-before\\:underline {
            --has-before: 1;
          }

          .custom-before\\:underline:before {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('grouped nested selectors with @slot', async () => {
      let { build } = await compile(css`
        @variant custom-before {
          & {
            --has-before: 1;
            &::before {
              &:hover,
              &:focus {
                @slot;
              }
            }
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['custom-before:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          .custom-before\\:underline {
            --has-before: 1;
          }

          .custom-before\\:underline:before:hover, .custom-before\\:underline:before:focus {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('nested multiple selectors with @slot', async () => {
      let { build } = await compile(css`
        @variant hocus {
          &:hover {
            @media (hover: hover) {
              @slot;
            }
          }

          &:focus {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['hocus:underline', 'group-hocus:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (hover: hover) {
            .group-hocus\\:underline:is(:where(.group):hover *) {
              text-decoration-line: underline;
            }
          }

          .group-hocus\\:underline:is(:where(.group):focus *) {
            text-decoration-line: underline;
          }

          @media (hover: hover) {
            .hocus\\:underline:hover {
              text-decoration-line: underline;
            }
          }

          .hocus\\:underline:focus {
            text-decoration-line: underline;
          }
        }"
      `)
    })

    test('selector nested under at-rule with @slot', async () => {
      let { build } = await compile(css`
        @variant hocus {
          @media (hover: hover) {
            &:hover {
              @slot;
            }
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['hocus:underline', 'group-hocus:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (hover: hover) {
            .group-hocus\\:underline:is(:where(.group):hover *) {
              text-decoration-line: underline;
            }
          }

          @media (hover: hover) {
            .hocus\\:underline:hover {
              text-decoration-line: underline;
            }
          }
        }"
      `)
    })

    test('at-rule with @slot', async () => {
      let { build } = await compile(css`
        @variant any-hover {
          @media (any-hover: hover) {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['any-hover:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (any-hover: hover) {
            .any-hover\\:underline {
              text-decoration-line: underline;
            }
          }
        }"
      `)
    })

    test('multiple at-rules with @slot', async () => {
      let { build } = await compile(css`
        @variant desktop {
          @media (any-hover: hover) {
            @slot;
          }

          @media (pointer: fine) {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['desktop:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (any-hover: hover) {
            .desktop\\:underline {
              text-decoration-line: underline;
            }
          }

          @media (pointer: fine) {
            .desktop\\:underline {
              text-decoration-line: underline;
            }
          }
        }"
      `)
    })

    test('nested at-rules with @slot', async () => {
      let { build } = await compile(css`
        @variant custom-variant {
          @media (orientation: landscape) {
            @media screen {
              @slot;
            }

            @media print {
              display: none;
            }
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['custom-variant:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (orientation: landscape) {
            @media screen {
              .custom-variant\\:underline {
                text-decoration-line: underline;
              }
            }

            @media print {
              .custom-variant\\:underline {
                display: none;
              }
            }
          }
        }"
      `)
    })

    test('at-rule and selector with @slot', async () => {
      let { build } = await compile(css`
        @variant custom-dark {
          @media (prefers-color-scheme: dark) {
            @slot;
          }
          &:is(.dark *) {
            @slot;
          }
        }

        @layer utilities {
          @tailwind utilities;
        }
      `)
      let compiled = build(['custom-dark:underline'])

      expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
        "@layer utilities {
          @media (prefers-color-scheme: dark) {
            .custom-dark\\:underline {
              text-decoration-line: underline;
            }
          }

          .custom-dark\\:underline:is(.dark *) {
            text-decoration-line: underline;
          }
        }"
      `)
    })
  })

  test('built-in variants can be overridden while keeping their order', async () => {
    expect(
      await compileCss(
        css`
          @variant dark (&:is([data-theme='dark'] *));
          @layer utilities {
            @tailwind utilities;
          }
        `,

        // Make sure the order does not change by including the variants
        // immediately before and after `dark`
        ['rtl:flex', 'dark:flex', 'starting:flex'],
      ),
    ).toMatchInlineSnapshot(`
      "@layer utilities {
        .rtl\\:flex:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *) {
          display: flex;
        }

        .dark\\:flex:is([data-theme="dark"] *) {
          display: flex;
        }

        @starting-style {
          .starting\\:flex {
            display: flex;
          }
        }
      }"
    `)
  })

  test('at-rule-only variants cannot be used with compound variants', async () => {
    expect(
      await compileCss(
        css`
          @variant foo (@media foo);

          @layer utilities {
            @tailwind utilities;
          }
        `,

        ['foo:flex', 'group-foo:flex', 'peer-foo:flex', 'has-foo:flex', 'not-foo:flex'],
      ),
    ).toMatchInlineSnapshot(`
      "@layer utilities {
        @media not foo {
          .not-foo\\:flex {
            display: flex;
          }
        }

        @media foo {
          .foo\\:flex {
            display: flex;
          }
        }
      }"
    `)
  })
})

describe('@utility', () => {
  test('@utility must be top-level and cannot be nested', () => {
    return expect(
      compileCss(css`
        .foo {
          @utility foo {
            color: red;
          }
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: \`@utility\` cannot be nested.]`)
  })

  test('@utility must include a body', () => {
    return expect(
      compileCss(css`
        @utility foo {
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: \`@utility foo\` is empty. Utilities should include at least one property.]`,
    )
  })

  test('@utility cannot contain any special characters', () => {
    return expect(
      compileCss(css`
        @utility 💨 {
          color: red;
        }
      `),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: \`@utility 💨\` defines an invalid utility name. Utilities should be alphanumeric and start with a lowercase letter.]`,
    )
  })
})

test('addBase', async () => {
  let { build } = await compile(
    css`
      @plugin "my-plugin";
      @layer base, utilities;
      @layer utilities {
        @tailwind utilities;
      }
    `,
    {
      loadModule: async () => ({
        module: ({ addBase }: PluginAPI) => {
          addBase({
            body: {
              'font-feature-settings': '"tnum"',
            },
          })
        },
        base: '/root',
      }),
    },
  )

  let compiled = build(['underline'])

  expect(optimizeCss(compiled).trim()).toMatchInlineSnapshot(`
    "@layer base {
      body {
        font-feature-settings: "tnum";
      }
    }

    @layer utilities {
      .underline {
        text-decoration-line: underline;
      }
    }"
  `)
})
