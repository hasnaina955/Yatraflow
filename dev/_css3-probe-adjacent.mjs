// Prove the sibling assertion fails when the pair is not adjacent.
import { launchChrome, assertAdjacentPairs } from './_css3-compare-lib.mjs'

const browser = await launchChrome()

const separated = await browser.newPage()
await separated.setContent(
  '<style>.card{display:block}</style>' +
    '<div><div class="card" data-key="a">1</div></div>' +
    '<div><div class="card" data-key="a--2">2</div></div>',
)
try {
  await assertAdjacentPairs(separated, ['a--2'], 'probe')
  console.log('FAIL: no throw when the cards are not siblings')
} catch (e) {
  console.log('THREW as required:', e.message)
}
await separated.close()

const adjacent = await browser.newPage()
await adjacent.setContent(
  '<style>.card{display:block}</style>' +
    '<div><div class="card" data-key="b">1</div><div class="card" data-key="b--2">2</div></div>',
)
try {
  const n = await assertAdjacentPairs(adjacent, ['b--2'], 'probe')
  console.log(`PASSED with ${n} pair(s), as required`)
} catch (e) {
  console.log('FAIL: threw on a genuine pair:', e.message)
}
await adjacent.close()

await browser.close()
