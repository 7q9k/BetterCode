import { describe, expect, test } from "bun:test"
import { virtualKeys } from "../../src/tool/plugin/computer"

describe("computer tool keys", () => {
  test("maps shortcuts to Windows virtual-key codes, in order", () => {
    expect(virtualKeys("ctrl+shift+t")).toEqual([0x11, 0x10, 0x54])
    expect(virtualKeys("Enter")).toEqual([0x0d])
    expect(virtualKeys("alt + f4")).toEqual([0x12, 0x73])
    expect(virtualKeys("win+1")).toEqual([0x5b, 0x31])
  })

  test("rejects an empty or unknown key with a hint", () => {
    expect(() => virtualKeys("")).toThrow("The key action needs keys")
    expect(() => virtualKeys("ctrl+hyper")).toThrow('Unknown key "hyper"')
  })
})
