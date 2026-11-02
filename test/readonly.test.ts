import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// The Knowledge Hub must never change the site it documents. Fail the build if
// any Designer API write method shows up in the source.
const WRITE_METHODS = /\.(set(Name|Slug|Parent|Metadata|Title|Description|Draft|OpenGraph\w*|Search\w*|Settings|Styles|TextContent|Attribute|Attributes|DomId|DisplayName|Visibility|Prop|Variant|SelectedVariant|CustomAttribute|AppConnection)|create\w+|registerComponent|unregisterComponent|removeProp|removeStyle|deleteVariant|excludeFromSearch|use[A-Z]\w*As\w+|append|prepend|before|after)\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

it('never calls a Designer API method that changes the site', () => {
  const offenders = files('src').flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('\n')
      .map((line, i) => ({ f, i: i + 1, line }))
      .filter(({ line }) => WRITE_METHODS.test(line) && !/document\.|createElement|createObjectURL|appendChild/.test(line)),
  );
  expect(offenders).toEqual([]);
});
