// ── Create panel: the field picks (labels, assignee, …) ────────────────────
// One state object per render, { key: string[] | string }. The chips and
// selects are drawn from it and write back to it; Create sends what it holds.
// B6: the labels sent once differed from the labels shown when the panel opened
// prefilled — Create read "the first fieldset in the page", which a stale or
// overlapping load could leave behind. Now nothing is read back from the page.
// Pure (no DOM) so it is unit-tested as shipped: tests/panel-fields.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

(function (root) {
  function ids(spec) {
    return (spec.options || []).map((op) => String(op.id));
  }

  /**
   * What starts picked: the remembered values (only those this repository
   * still offers). A multi field with nothing remembered for this repository
   * (undefined, not an empty list) starts with "bug" ticked, if it has one.
   */
  function initialPicks(specs, remembered) {
    const picks = {};
    (specs || []).forEach((spec) => {
      const have = ids(spec);
      const preset = remembered ? remembered[spec.key] : undefined;
      if (spec.kind === "single") {
        const v = Array.isArray(preset) ? preset[0] : preset;
        picks[spec.key] = v != null && have.indexOf(String(v)) !== -1 ? String(v) : "";
        return;
      }
      if (preset === undefined) {
        const bug = (spec.options || []).find((op) => String(op.label).toLowerCase() === "bug");
        picks[spec.key] = bug ? [String(bug.id)] : [];
        return;
      }
      const want = (Array.isArray(preset) ? preset : [preset]).map(String);
      picks[spec.key] = have.filter((id) => want.indexOf(id) !== -1);
    });
    return picks;
  }

  /** Tick or untick one option of a multi field; returns whether it is now on. */
  function toggle(picks, key, id) {
    const list = Array.isArray(picks[key]) ? picks[key] : (picks[key] = []);
    const i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
    return i === -1;
  }

  function isPicked(picks, key, id) {
    const v = picks[key];
    return Array.isArray(v) ? v.indexOf(id) !== -1 : v === id;
  }

  /** The fields Create sends: exactly the picks, in the repository's order. */
  function choiceFields(specs, picks) {
    const fields = {};
    (specs || []).forEach((spec) => {
      const v = picks ? picks[spec.key] : undefined;
      const have = ids(spec);
      if (spec.kind === "single") {
        if (typeof v === "string" && v && have.indexOf(v) !== -1) fields[spec.key] = v;
        return;
      }
      const list = Array.isArray(v) ? v : [];
      fields[spec.key] = have.filter((id) => list.indexOf(id) !== -1);
    });
    return fields;
  }

  root.TraceBugPanelFields = { initialPicks, toggle, isPicked, choiceFields };
})(typeof self !== "undefined" ? self : this);
