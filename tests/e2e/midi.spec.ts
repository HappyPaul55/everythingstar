import { expect, test, type Page } from "@playwright/test";
import {
  FIXTURE_NOTE_COUNT,
  SONG_TITLE,
  disableFullscreen,
  installFixtures,
} from "./fixture";
import { enterGame, waitForPlaying } from "./helpers";

/**
 * A MIDI kit, end to end.
 *
 * The browser has no real Web MIDI device in a headless test, so the page is given
 * a fake `navigator.requestMIDIAccess` **before any script runs** — the same thing
 * the product would get from a browser with a kit plugged in. The fake input has an
 * `onmidimessage` the test can call, so a note-on travels the real route: the
 * stage's one listener, the seat's layout, the existing judging.
 *
 * The seat is set up through the gear rather than by writing the band store: that is
 * the flow a player uses, and it is also the one gesture that may ask for MIDI. The
 * run is the fixture song (a chord and a handful of strum notes, no audio); the test holds the three
 * frets and sends a strum over and over, so every note in the chart is inside a hit
 * window at least once. What it does **not** cover is a real device's timing,
 * `onstatechange` with hardware, or sysex (which is never requested).
 */
async function installFakeMidi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeInput {
      id = "fake-kit";
      name = "Test Kit";
      manufacturer = "EverythingStar";
      state = "connected";
      connection = "open";
      type = "input";
      version = "1";
      onmidimessage: ((event: Event) => void) | null = null;
    }
    const input = new FakeInput();
    const access = {
      inputs: new Map<string, FakeInput>([[input.id, input]]),
      outputs: new Map(),
      sysexEnabled: false,
      onstatechange: null as ((event: Event) => void) | null,
    };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: () => {
        const counted = window as unknown as { __midiCalls?: number };
        counted.__midiCalls = (counted.__midiCalls ?? 0) + 1;
        return Promise.resolve(access);
      },
    });
    (window as unknown as { __midi: { send: (bytes: number[]) => void } }).__midi = {
      send: (bytes: number[]) => {
        const event = new Event("midimessage");
        Object.defineProperty(event, "data", { value: new Uint8Array(bytes) });
        input.onmidimessage?.(event);
      },
    };
  });
}

/** Walk to the fixture's band and put Player 1 on the fake kit, through the gear. */
async function chooseMidiSeat(page: Page) {
  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await expect(page.getByRole("heading", { name: "Who is playing?" })).toBeVisible();
  // One guitar, played by the person at the kit. Without a second lane there is no
  // machine score mixed into the card the positive test reads.
  await page.getByRole("button", { name: "Remove player 2" }).click();
  await page.getByRole("button", { name: "Player 1: controller" }).click();
  const config = page.getByRole("dialog", { name: /Player 1/ });
  await expect(config).toBeVisible();
  await config.getByRole("button", { name: "MIDI keyboard or kit" }).click();
  await expect(config.getByText("MIDI inputs seen: Test Kit")).toBeVisible();
  return config;
}

test("a MIDI seat plays notes through the stage's input route", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await installFakeMidi(page);
  await enterGame(page);

  // Nothing was asked for on load: the menu, the jukebox and the band screen cost
  // no permission at all.
  expect(
    await page.evaluate(() => (window as unknown as { __midiCalls?: number }).__midiCalls ?? 0),
  ).toBe(0);

  const config = await chooseMidiSeat(page);

  // Choosing MIDI is the gesture the permission needs. The connected input is named
  // back, so a player can tell their kit was seen, and the mapping is the preset cut
  // to this chart's three columns.
  await expect(config.getByText("C4 D4 E4 · C5 D5 · E5")).toBeVisible();
  await config.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();

  // Wait for the run itself: the entrance is only a slide and a hype, so the song
  // is moving once the screen says it is playing. A press before that means nothing.
  await expect(page.getByRole("region", { name: "Player 1 — Guitar" })).toBeVisible({
    timeout: 20_000,
  });
  await waitForPlaying(page);

  // Hold the three frets of this chart and strum every 70 ms, well inside the
  // 150 ms hit window. The frets are sent each turn as well as held: a note-on is
  // idempotent, and it means the test does not depend on whether the first press
  // landed before the clock started. A note-off follows every strum, as a kit sends.
  await page.evaluate(() => {
    const midi = (window as unknown as { __midi: { send: (bytes: number[]) => void } }).__midi;
    (window as unknown as { __strum: number }).__strum = window.setInterval(() => {
      midi.send([0x90, 60, 100]);
      midi.send([0x90, 62, 100]);
      midi.send([0x90, 64, 100]);
      midi.send([0x90, 72, 100]);
      midi.send([0x80, 72, 0]);
    }, 70);
  });

  await expect(page.getByRole("heading", { name: "Results" })).toBeVisible({
    timeout: 20_000,
  });

  // Let the hands go and stop strumming before reading the cards.
  await page.evaluate(() => {
    const midi = (window as unknown as { __midi: { send: (bytes: number[]) => void } }).__midi;
    const timer = (window as unknown as { __strum: number }).__strum;
    window.clearInterval(timer);
    midi.send([0x80, 60, 0]);
    midi.send([0x80, 62, 0]);
    midi.send([0x80, 64, 0]);
  });

  // The seat's own card says notes landed: the score moved because a MIDI message
  // became an action, not because the machine covered the lane.
  const card = page.locator(".results__player").filter({ hasText: "Player 1 · Guitar" });
  await expect(card).toBeVisible();
  const stats = await card.locator(".results__player-stats").textContent();
  expect(stats ?? "").toMatch(new RegExp(`[1-9]\\d*/${FIXTURE_NOTE_COUNT} notes`));

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("a MIDI seat learns its controls by pressing them, and refuses a repeat", async ({
  context,
  page,
}) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await installFakeMidi(page);
  await enterGame(page);

  const config = await chooseMidiSeat(page);
  await config.getByRole("button", { name: "Set it up" }).click();
  await expect(config.getByText(/press a pad or a key, or move a pedal/)).toBeVisible();
  // Starting a session replaces the button that was pressed with the step list, and
  // the list takes focus rather than Cancel, so a bumped Space/Enter cannot end the
  // session before the first control is answered.
  await expect(config.locator("ol.config__steps")).toBeFocused();

  const send = (bytes: number[]) =>
    page.evaluate((data) => {
      (window as unknown as { __midi: { send: (bytes: number[]) => void } }).__midi.send(data);
    }, bytes);

  // The first answer says both halves a player needs to recognise a pad: the note
  // number and the channel it arrived on (0x99 is channel 10).
  await send([0x99, 36, 100]);
  await expect(config.getByText("note 36 · channel 10")).toBeVisible();

  // The same note cannot be the next control too.
  await send([0x99, 36, 100]);
  await expect(config.getByText("that one is taken - press another")).toBeVisible();

  await config.getByRole("button", { name: "Cancel" }).click();
  await expect(config.getByRole("button", { name: "MIDI keyboard or kit" })).toBeVisible();
  // Cancelling unmounts the button that had focus; it goes back to the Learn button
  // rather than to `<body>`.
  await expect(config.getByRole("button", { name: "Set it up" })).toBeFocused();

  expect(leaked, "unexpected external requests").toEqual([]);
});

test("MIDI that is refused leaves the seat on what it had", async ({ context, page }) => {
  const leaked = await installFixtures(context);
  await disableFullscreen(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: () =>
        Promise.reject(new DOMException("no MIDI for you", "NotAllowedError")),
    });
  });
  await enterGame(page);

  await page.getByRole("button", { name: /Quick Play/ }).click();
  await page.getByRole("button", { name: new RegExp(SONG_TITLE) }).click();
  await page.getByRole("button", { name: "Next: your band" }).click();
  await page.getByRole("button", { name: "Player 1: controller" }).click();
  const config = page.getByRole("dialog", { name: /Player 1/ });

  await config.getByRole("button", { name: "MIDI keyboard or kit" }).click();
  await expect(config.getByText(/MIDI access was not given/)).toBeVisible();
  // A refusal does not turn the seat into the machine: it keeps the preset its
  // place would have had, and the MIDI option is not left looking chosen.
  await expect(config.getByRole("button", { name: "MIDI keyboard or kit" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(config.getByText("the preset for their place")).toBeVisible();

  expect(leaked, "unexpected external requests").toEqual([]);
});
