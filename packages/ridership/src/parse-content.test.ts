import { describe, expect, it } from "bun:test";
import { parsePostContent } from "./parse-content";

describe("parseContentToMap", () => {
  it("basic numeric line parsing", () => {
    const sample = "南京地铁12月31日客运量423.3，其中1号线109.6，2号线97，3号线86.1";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 109.6,
      "2": 97,
      "3": 86.1,
    });
    expect(total).toBe(423.3);
  });

  it("missing characters", () => {
    const sample =
      "南京地铁12月11日线网客运量248.9,  其中1号线86.3,  2号线78.6,  3号线56.7,  10号13.6,  S1机场线5.9,  S8宁天线7.8";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 86.3,
      "2": 78.6,
      "3": 56.7,
      "10": 13.6,
      S1: 5.9,
      S8: 7.8,
    });
    expect(total).toBe(248.9);
  });

  it("S-prefixed alias names with suffixes and numbers", () => {
    const sample =
      "南京地铁10月2日全线网客运量334.1万次，S1机场线12.4，S3宁和线7，S7宁溧线1.8，S8宁天线12.5，S9宁高线5";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      S1: 12.4,
      S3: 7,
      S7: 1.8,
      S8: 12.5,
      S9: 5,
    });
    expect(total).toBe(334.1);
  });

  it("S-prefixed alias names with suffixes and numbers 2", () => {
    const sample =
      "南京地铁3月16日线网客运量143.6，其中1号线35.7，2号线39.1，3号线31.9，4号线12.3，10号线11.2，S3宁和线5.2，S6宁句线1.7，S8宁天线6.5";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 35.7,
      "2": 39.1,
      "3": 31.9,
      "4": 12.3,
      "10": 11.2,
      S3: 5.2,
      S6: 1.7,
      S8: 6.5,
    });
    expect(total).toBe(143.6);
  });

  it("normalizes Chinese numerals and numeric lines", () => {
    const sample =
      "南京地铁昨日客运量1102222人次，其中一号线（含南延线）690920人次，二号线411302人次，新街口站92913人次，南京站40217人次";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 69.092,
      "2": 41.1302,
    });
    expect(total).toBe(110.2222);
  });

  it("missing punctuation between entries and mixed formats", () => {
    const sample = "南京地铁7月22日全线网客运量137.1,其中:一号线70.4二号线52.3十号线10.2,机场线4.2";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 70.4,
      "2": 52.3,
      "10": 10.2,
      S1: 4.2,
    });
    expect(total).toBe(137.1);
  });

  it("handles garbled/dirty line ids", () => {
    const sample =
      "南京地铁10月3日全线网客运量232.1,  其中1号线78.6,  2号线63.6, 73号线61,  10号线10.3,  S1机场线7.5,  S8宁天线11.1";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 78.6,
      "2": 63.6,
      "3": 61,
      "10": 10.3,
      S1: 7.5,
      S8: 11.1,
    });
    expect(total).toBe(232.1);
  });

  it("handle aliases in parentheses", () => {
    const sample =
      "南京地铁3月28日全线网客运量为186.3，其中：1号线96，2号线67.4，10号线12.6，S1(机场线)7.7，S8(宁天线)2.6";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 96,
      "2": 67.4,
      "10": 12.6,
      S1: 7.7,
      S8: 2.6,
    });
    expect(total).toBe(186.3);
  });

  it("handle aliases in parentheses 2", () => {
    const sample =
      "南京地铁8月1日线网客运量151.08,其中:1号线74.26,2号线53.66,10号线10.94,S1号线（机场线）5.25,S8号线(宁天线)6.97";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 74.26,
      "2": 53.66,
      "10": 10.94,
      S1: 5.25,
      S8: 6.97,
    });
    expect(total).toBe(151.08);
  });

  it("handle aliases in parentheses 3", () => {
    const sample =
      "南京地铁2月2日全线网客运量140,  其中1号线71.3,  2号线52,  10号线10.8,  S号线(机场线)4.4,  S8号线(宁天线)1.5.";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "1": 71.3,
      "2": 52,
      "10": 10.8,
      S1: 4.4,
      S8: 1.5,
    });
    expect(total).toBe(140);
  });

  it("handles mistakes in line names 1", () => {
    const sample = "S8宁和线3.2,  S8宁天线8";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      S3: 3.2,
      S8: 8,
    });
    expect(total).toBeUndefined();
  });

  it("handles mistakes in line names 2", () => {
    const sample = "S3宁和线5,  S3宁天线10.8";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      S3: 5,
      S8: 10.8,
    });
    expect(total).toBeUndefined();
  });

  it("linebreaks", () => {
    const sample = "S8宁\n天线10.3";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      S8: 10.3,
    });
    expect(total).toBeUndefined();
  });

  it("missing line id", () => {
    const sample = "3号线51.5， 号线14.6";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      "3": 51.5,
      "4": 14.6,
    });
    expect(total).toBeUndefined();
  });

  it("extra comma", () => {
    const sample = "S9宁高线,1.9";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({
      S9: 1.9,
    });
    expect(total).toBeUndefined();
  });

  it("missing decimal", () => {
    const sample = "S1机场线.4";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({});
    expect(total).toBeUndefined();
  });

  it("non-ridership content", () => {
    const sample = "ps:端午期间，地铁侠邀请您参加公益活动#地铁加摩拜,六一骑分享#";
    const { counts, total } = parsePostContent(sample);
    expect(counts).toEqual({});
    expect(total).toBeUndefined();
  });

  it("incomplete total 1", () => {
    const sample = "客运量为114万人次";
    const { total } = parsePostContent(sample);
    expect(total).toBe(114);
  });
  it("incomplete total 2", () => {
    const sample = "客运量约114万";
    const { total } = parsePostContent(sample);
    expect(total).toBe(114);
  });
  it("incomplete total 3", () => {
    const sample = "客运量约近114";
    const { total } = parsePostContent(sample);
    expect(total).toBe(114);
  });
});
