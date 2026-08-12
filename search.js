/* BOOK SPACE · 本地全文检索 */
(() => {
  const FIELD_WEIGHTS = Object.freeze({
    title: 140,
    sub: 82,
    author: 108,
    translator: 70,
    isbn: 160,
    cat: 62,
    tags: 72,
    tag3: 58,
    tag: 52,
    publisher: 46,
    year: 40,
    origin: 38,
    source: 44,
    desc: 16
  });

  function normalize(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\u3000\s]+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/[\s·•:：,，。.!！?？'"“”‘’《》【】\[\]()（）—–\-_/\\]+/g, "");
  }

  function tokensOf(query) {
    const matches = normalize(query).match(/"[^"]+"|'[^']+'|\S+/g) || [];
    return [...new Set(matches.map(token => compact(token.replace(/^['"]|['"]$/g, ""))).filter(Boolean))];
  }

  function fieldValues(book) {
    const source = [
      book.source === "weread" ? "微信读书 电子书" : "实体书 纸质书",
      book.finished ? "已读完 已读" : book.source === "weread" ? "在读" : "",
      book.secret ? "私密" : ""
    ].filter(Boolean).join(" ");

    return {
      title: [book.title],
      sub: [book.sub],
      author: [book.author],
      translator: [book.translator],
      isbn: [book.isbn],
      cat: [book.cat],
      tags: book.tags || [],
      tag3: book.tag3 || [],
      tag: [book.tag],
      publisher: [book.publisher],
      year: [book.year],
      origin: [book.origin],
      source: [source],
      desc: [book.desc]
    };
  }

  function create(books) {
    const entries = books.map((book, index) => {
      const fields = Object.entries(fieldValues(book)).map(([name, values]) => ({
        name,
        weight: FIELD_WEIGHTS[name],
        values: values.filter(Boolean).map(value => ({
          text: normalize(value),
          compact: compact(value)
        }))
      }));
      return { index, fields };
    });

    function search(query) {
      const tokens = tokensOf(query);
      if (!tokens.length) return books.map((_, index) => ({ index, score: 0 }));
      const whole = compact(query);
      const results = [];

      entries.forEach(entry => {
        let score = 0;
        for (const token of tokens) {
          let tokenScore = 0;
          entry.fields.forEach(field => {
            field.values.forEach(value => {
              if (!value.compact.includes(token)) return;
              let factor = 1;
              if (value.compact === token) factor = 2.15;
              else if (value.compact.startsWith(token)) factor = 1.55;
              tokenScore = Math.max(tokenScore, field.weight * factor);
            });
          });
          if (!tokenScore) return;
          score += tokenScore;
        }

        if (!score) return;
        const title = entry.fields.find(field => field.name === "title")?.values[0]?.compact || "";
        if (title === whole) score += 420;
        else if (whole && title.startsWith(whole)) score += 180;
        else if (whole && title.includes(whole)) score += 90;
        results.push({ index: entry.index, score });
      });

      return results.sort((a, b) => b.score - a.score || a.index - b.index);
    }

    return Object.freeze({ search, tokensOf });
  }

  window.BookSearch = Object.freeze({ create, normalize, tokensOf });
})();
