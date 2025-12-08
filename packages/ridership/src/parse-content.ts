import assert from "node:assert";

// map simple Chinese numerals to digits
const chineseMap: Record<string, string> = {
  一: "1",
  二: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
  十: "10",
};
const aliasMap: Record<string, string> = {
  机场: "S1",
  宁和: "S3",
  宁句: "S6",
  宁溧: "S7",
  宁天: "S8",
  宁高: "S9",
};

// known dirty/garbled ids mapping
const dirtyMap: Record<string, string> = { "73": "3" };

// Helpers to normalize Chinese numerals
const normalizeChineseNum = (tok: string) => chineseMap[tok] ?? tok;

export const parsePostContent = (
  content: string,
): { counts: Record<string, number>; total?: number } => {
  // Normalize the content
  const s = content
    .replace(/\n/g, "")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/S号线\(机场线\)/g, "S1号线") // special case
    .replace(/(号线)?\(..线\)/g, "号线") // remove aliases in parentheses
    .replace(/\(.*?\)/g, "") // remove any other parentheses content
    .replace(/([一二三四五六七八九十])(?:号线|号)/g, (_, p1) => `,${normalizeChineseNum(p1)}号线`) // normalize Chinese numerals
    .replace(/(S\d+)?(机场|宁.)线?/g, (_, p1, p2) => `,${aliasMap[p2] ?? p1 ?? p2}号线`); // normalize S-prefixed aliases

  const counts: Record<string, number> = {};

  // Match the line name
  // It can have the following forms:
  // 1号线, 10号线, 一号线, 1号, S1号线, S1机场线, S3宁和线, 机场线
  // where some are mistakes
  // A number follows the name (possibly plus some additional irrelevant characters). The number may be without unit "万".
  const re = /(S?\d+| )(?:号线|号),?\s*([0-9]+(?:\.[0-9]+)?)/g;

  let m: RegExpExecArray | null = null;
  while ((m = re.exec(s)) !== null) {
    assert(m[1] && m[2]);
    const name = m[1] === " " ? "4" : m[1]; // dirty case: " " means line 4

    const val = parseFloat(m[2]);
    if (!Number.isNaN(val)) {
      // Fixup known dirty/garbled ids: e.g. "73号线" is a common bad parse that should map to "3"
      const canonical = dirtyMap[name] ?? name;
      // heuristic: values > 1000 likely mean raw person counts -> convert into 万
      counts[canonical] = val > 1000 ? val / 10000 : val;
    }
  }

  // Extract total
  const totalRe = /(?:客运量?约?为?近?|全线网客运?)\s*([0-9]+(?:\.[0-9]+)?)/;
  const totalMatch = totalRe.exec(s);
  let total: number | undefined;
  if (totalMatch?.[1]) {
    const totalVal = parseFloat(totalMatch[1]);
    if (!Number.isNaN(totalVal)) {
      total = totalVal > 1000 ? totalVal / 10000 : totalVal;
    }
  }

  return { counts, total };
};
