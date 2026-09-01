import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateLanguages,
  escapeXml,
  fetchPaginated,
  parseLinkHeader,
  renderLanguagesSvg,
  renderStatsSvg,
} from "./generate-profile-stats.mjs";

test("escapeXml safely encodes SVG text", () => {
  assert.equal(
    escapeXml(`Alex & <friends> "build" 'things'`),
    "Alex &amp; &lt;friends&gt; &quot;build&quot; &apos;things&apos;",
  );
});

test("parseLinkHeader finds GitHub pagination links", () => {
  assert.deepEqual(
    parseLinkHeader(
      '<https://api.github.com/items?page=2>; rel="next", <https://api.github.com/items?page=4>; rel="last"',
    ),
    {
      next: "https://api.github.com/items?page=2",
      last: "https://api.github.com/items?page=4",
    },
  );
});

test("fetchPaginated follows every next link", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);
    if (url.endsWith("page=1")) {
      return new Response(JSON.stringify([{ id: 1 }]), {
        headers: {
          link: '<https://api.github.com/items?page=2>; rel="next"',
        },
      });
    }
    return new Response(JSON.stringify([{ id: 2 }]));
  };

  const items = await fetchPaginated("https://api.github.com/items?page=1", {
    token: "test-token",
    fetchImpl,
  });

  assert.deepEqual(items, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(requestedUrls, [
    "https://api.github.com/items?page=1",
    "https://api.github.com/items?page=2",
  ]);
});

test("aggregateLanguages combines bytes and uses a deterministic tie-breaker", () => {
  assert.deepEqual(
    aggregateLanguages([
      { TypeScript: 90, JavaScript: 10 },
      { JavaScript: 80, Python: 90 },
    ]),
    [
      { name: "JavaScript", bytes: 90 },
      { name: "Python", bytes: 90 },
      { name: "TypeScript", bytes: 90 },
    ],
  );
});

test("rendered cards are accessible and escape profile data", () => {
  const stats = renderStatsSvg({
    owner: "Alex & team",
    publicRepos: 10,
    stars: 20,
    forks: 3,
    followers: 4,
  });
  const languages = renderLanguagesSvg({
    owner: "Alex & team",
    languages: [{ name: "C# & XML", bytes: 100 }],
    repositoryCount: 2,
  });

  for (const svg of [stats, languages]) {
    assert.match(svg, /role="img" aria-labelledby="title desc"/);
    assert.match(svg, /<title id="title">/);
    assert.match(svg, /<desc id="desc">/);
    assert.doesNotMatch(svg, /Alex & team/);
  }
  assert.match(stats, /Alex &amp; team/);
  assert.match(languages, /C# &amp; XML/);
});
