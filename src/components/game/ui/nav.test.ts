import { describe, expect, test } from "bun:test";
import { isEditable } from "./nav";

/**
 * A field without a DOM: `isEditable` reads only what a field says about itself —
 * its tag, whether it is editable content, and an input's type — so a small object
 * is enough to hold the rule to its word.
 */
function field(tagName: string, type?: string): Element {
  return { tagName, type } as unknown as Element;
}

const editableContent = (): Element =>
  ({ tagName: "DIV", isContentEditable: true }) as unknown as Element;

describe("isEditable", () => {
  test("a place characters go is editable", () => {
    expect(isEditable(field("TEXTAREA"))).toBe(true);
    expect(isEditable(field("INPUT", "text"))).toBe(true);
    // A real input with no type says "text", so a bare input is one too.
    expect(isEditable(field("INPUT"))).toBe(true);
    expect(isEditable(field("INPUT", "search"))).toBe(true);
    expect(isEditable(field("INPUT", "number"))).toBe(true);
    expect(isEditable(field("INPUT", "date"))).toBe(true);
    expect(isEditable(editableContent())).toBe(true);
  });

  test("a control that is not a text field keeps the game's keys", () => {
    expect(isEditable(field("INPUT", "range"))).toBe(false);
    expect(isEditable(field("INPUT", "checkbox"))).toBe(false);
    expect(isEditable(field("INPUT", "radio"))).toBe(false);
    expect(isEditable(field("INPUT", "button"))).toBe(false);
    expect(isEditable(field("INPUT", "submit"))).toBe(false);
    expect(isEditable(field("INPUT", "reset"))).toBe(false);
    expect(isEditable(field("INPUT", "file"))).toBe(false);
    expect(isEditable(field("INPUT", "color"))).toBe(false);
    expect(isEditable(field("INPUT", "image"))).toBe(false);
    expect(isEditable(field("SELECT"))).toBe(false);
  });

  test("nothing focused is nothing to type in", () => {
    expect(isEditable(null)).toBe(false);
  });
});
