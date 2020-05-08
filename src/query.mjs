export function SymatemQueryMixin(base) {
  return class SymatemQueryMixin extends base {
    initPredefinedSymbols() {
      super.initPredefinedSymbols();
      this.registerNamespaces({ Query: ["Placeholder"] });
    }

    /**
     * define query placeholders.
     * Either as wildcards without data
     * or with matching data
     * @param ns
     * @param {Object|String[]} definition
     */
    placeholders(ns, definition) {
      if (Array.isArray(definition)) {
        definition = Object.fromEntries(definition.map(d => [d, undefined]));
      }

      const result = {};

      for (const [name, value] of Object.entries(definition)) {
        const s = this.createSymbol(ns);
        this.setData(s, name);
        this.setTriple(
          [s, this.symbolByName.Type, this.symbolByName.Placeholder],
          true
        );
        result[name] = s;

        if (value !== undefined) {
          const ds = this.createSymbol(ns);
          this.setData(ds, value);
          this.setTriple([s, this.symbolByName.Value, ds], true);
        }
      }
      return result;
    }

    isPlaceholder(symbol) {
      return this.getTriple([
        symbol,
        this.symbolByName.Type,
        this.symbolByName.Placeholder
      ]);
    }

    getLiteralData(symbol) {
      for (const r of this.queryTriples(this.queryMasks.MMV, [
        symbol,
        this.symbolByName.Value,
        this.symbolByName.Void
      ])) {
        return this.getData(r[2]);
      }
    }

    /**
     * Execute SPARQL like query
     * The symbol table can be filled with plain symbols placeholders or literals
     * symbols as defined with placeholders()
     * ```js
     * const ns = ...
     * const s1,s2,s3 = ...
     * const {A,B,C} = backend.placeholders(ns,['A','B','C']);
     * const {D} = backend.placeholders(ns,{D: "my data"});
     * for(const result of backend.query([
     *   [A, s1, B],
     *   [B, s2, C],
     *   [C, s3, D]
     * ])) {
     *  result.get('A') // symbol for placeholder 'A'
     *  result.get('D') // symbol for placeholder 'D' mtching data
     * }
     * ```
     * @param {Symbol[][]} queries
     * @param {Map<Placeholder,Symbol>} initial
     * @return {Iterator<Map<Placeholder,Symbol>>}
     */
    *query(queries = [], initial = new Map()) {
      if (queries.length === 0) {
        yield initial;
      } else {
        const query = queries[0].map(s =>
          initial.get(s) ? initial.get(s) : s
        );
        const isPlaceholder = query.map(s => this.isPlaceholder(s));

        const mask = this.queryMasks[
          isPlaceholder.map(f => (f ? "V" : "M")).join("")
        ];

        for (const r of this.queryTriples(mask, query)) {
          const results = new Map(initial);

          let found = true;

          query.forEach((s, i) => {
            if (isPlaceholder[i]) {
              const literalData = this.getLiteralData(s);
              if (
                literalData !== undefined &&
                literalData !== this.getData(r[i])
              ) {
                found = false;
              } else {
                results.set(s, r[i]);
              }
            }
          });
          if (found) {
            yield* this.query(queries.slice(1), results);
          }
        }
      }
    }

    /**
     * Traverse the graph by applying query over and over again.
     * After each iteration mapping results back into initial (by using result2initial)
     * @param {Symbol[][]} queries
     * @param {Map<Placeholder,Symbol>} initial
     * @param {Map<Placeholder,Placeholder>} result2initial
     * @return {Iterator<Map<Placeholder,Symbol>>}
     */
    *traverse(queries, initial, result2initial) {
      for (const result of this.query(queries, initial)) {
        yield result;
        initial = new Map(
          [...result2initial.entries()].map(([k, v]) => [v, result.get(k)])
        );

        yield* this.traverse(queries, initial, result2initial);
      }
    }
  };
}
