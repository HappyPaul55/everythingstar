import { describe, expect, test } from "bun:test";
import {
  SCREENS,
  backEventFor,
  isRunScreen,
  onStage,
  opensRun,
  pausesOnFullscreenEnd,
  pausesOnHidden,
  screenAfter,
  wantsCharts,
  type Screen,
} from "./screens";

describe("screenAfter", () => {
  test("walks the loop the game is played in", () => {
    expect(screenAfter("welcome", "enter")).toBe("menu");
    expect(screenAfter("menu", "enter")).toBe("songs");
    expect(screenAfter("songs", "back")).toBe("menu");
    expect(screenAfter("songs", "open")).toBe("band");
    expect(screenAfter("band", "play")).toBe("loading");
    expect(screenAfter("band", "start")).toBe("countdown");
    expect(screenAfter("loading", "loaded")).toBe("countdown");
    expect(screenAfter("countdown", "go")).toBe("playing");
    expect(screenAfter("playing", "end")).toBe("results");
    expect(screenAfter("results", "replay")).toBe("countdown");
  });

  test("the menu's two branches are round trips", () => {
    expect(screenAfter("menu", "options")).toBe("options");
    expect(screenAfter("options", "back")).toBe("menu");
    expect(screenAfter("menu", "credits")).toBe("credits");
    expect(screenAfter("credits", "back")).toBe("menu");
    // And back out of the menu is the title it came from.
    expect(screenAfter("menu", "back")).toBe("welcome");
  });

  test("the song and the band are two steps, and back works between them", () => {
    expect(screenAfter("band", "back")).toBe("songs");
    expect(screenAfter("band", "quit")).toBe("songs");
  });

  test("pause is a round trip", () => {
    expect(screenAfter("playing", "pause")).toBe("paused");
    expect(screenAfter("paused", "resume")).toBe("playing");
    expect(screenAfter("paused", "restart")).toBe("countdown");
  });

  test("practice is a run from the pause, and the countdown is its count-in", () => {
    expect(screenAfter("paused", "practice")).toBe("countdown");
    // The plan is session state, so the countdown and the run are the ordinary
    // ones: there is no practice screen to reach.
    expect(screenAfter("countdown", "go")).toBe("playing");
    // And outside a pause the event means nothing.
    expect(screenAfter("playing", "practice")).toBe("playing");
    expect(screenAfter("results", "practice")).toBe("results");
  });

  test("quitting always lands on the songs", () => {
    for (const screen of ["band", "loading", "countdown", "playing", "paused", "results"] as Screen[]) {
      expect(screenAfter(screen, "quit")).toBe("songs");
    }
  });

  test("an event that means nothing here changes nothing", () => {
    expect(screenAfter("welcome", "go")).toBe("welcome");
    expect(screenAfter("welcome", "options")).toBe("welcome");
    expect(screenAfter("menu", "play")).toBe("menu");
    expect(screenAfter("options", "enter")).toBe("options");
    expect(screenAfter("credits", "quit")).toBe("credits");
    expect(screenAfter("songs", "pause")).toBe("songs");
    expect(screenAfter("band", "go")).toBe("band");
    expect(screenAfter("results", "end")).toBe("results");
    // The song running out while paused or counting in is not an ending.
    expect(screenAfter("paused", "end")).toBe("paused");
    expect(screenAfter("countdown", "end")).toBe("countdown");
  });
});

describe("backEventFor", () => {
  test("one key is the way back through the whole loop", () => {
    expect(backEventFor("welcome")).toBeNull();
    for (const screen of ["menu", "options", "credits", "songs", "band"] as Screen[]) {
      expect(backEventFor(screen)).toBe("back");
    }
    for (const screen of ["loading", "countdown", "results"] as Screen[]) {
      expect(backEventFor(screen)).toBe("quit");
    }
  });

  test("a run pauses rather than leaving", () => {
    expect(backEventFor("playing")).toBe("pause");
    expect(backEventFor("paused")).toBe("resume");
  });
});

describe("pausesOnFullscreenEnd", () => {
  test("a run pauses when the browser takes the screen away", () => {
    expect(pausesOnFullscreenEnd("playing", true, false)).toBe(true);
  });

  test("nothing else does — entering, or a screen with no run on it", () => {
    expect(pausesOnFullscreenEnd("playing", false, true)).toBe(false);
    expect(pausesOnFullscreenEnd("playing", true, true)).toBe(false);
    expect(pausesOnFullscreenEnd("paused", true, false)).toBe(false);
    expect(pausesOnFullscreenEnd("menu", true, false)).toBe(false);
    expect(pausesOnFullscreenEnd("countdown", true, false)).toBe(false);
  });
});

describe("pausesOnHidden", () => {
  test("a running song pauses when the tab is hidden", () => {
    expect(pausesOnHidden("playing", true)).toBe(true);
  });

  test("no other screen has a transport to pause", () => {
    for (const screen of SCREENS.filter((it) => it !== "playing")) {
      expect(pausesOnHidden(screen, true)).toBe(false);
    }
  });

  test("coming back does nothing", () => {
    for (const screen of SCREENS) expect(pausesOnHidden(screen, false)).toBe(false);
  });
});

describe("isRunScreen", () => {
  test("a run is everything between the band and the results", () => {
    const run = SCREENS.filter(isRunScreen);
    expect(run).toEqual(["loading", "countdown", "playing", "paused"]);
  });
});

describe("opensRun", () => {
  test("the band, the load and a replay walk the band on stage", () => {
    // A band whose charts and sound are already ready skips the load screen and
    // goes straight to the countdown; that is the same entrance.
    expect(opensRun("countdown", "band")).toBe(true);
    expect(opensRun("countdown", "loading")).toBe(true);
    expect(opensRun("countdown", "results")).toBe(true);
  });

  test("a restart or a practice pass is not a new entrance", () => {
    expect(opensRun("countdown", "paused")).toBe(false);
  });

  test("re-entering the countdown is not a new entrance", () => {
    // A replay's charts can arrive after the countdown is up and change the
    // entrance length; that is the same entry, not a second one.
    expect(opensRun("countdown", "countdown")).toBe(false);
  });

  test("only the countdown can open a run", () => {
    for (const screen of SCREENS) {
      if (screen === "countdown") continue;
      expect(opensRun(screen, "loading")).toBe(false);
    }
    expect(opensRun("countdown", null)).toBe(false);
    expect(opensRun("countdown", "welcome")).toBe(false);
    expect(opensRun("countdown", "playing")).toBe(false);
  });
});

describe("wantsCharts", () => {
  test("browsing is not playing", () => {
    expect(SCREENS.filter(wantsCharts)).toEqual([
      "band",
      "loading",
      "countdown",
      "playing",
      "paused",
      "results",
    ]);
  });

  test("the results keep the charts for a replay", () => {
    // A replay is the same song again: letting the track go at the results
    // makes the countdown run against a shell and fetch the song a second time.
    expect(wantsCharts("results")).toBe(true);
  });

  test("the way to the jukebox fetches nothing", () => {
    for (const screen of ["welcome", "menu", "options", "credits", "songs"] as Screen[]) {
      expect(wantsCharts(screen)).toBe(false);
    }
  });
});

describe("onStage", () => {
  test("the stage is up for the song, and for what happens during it", () => {
    expect(SCREENS.filter(onStage)).toEqual(["countdown", "playing", "paused"]);
  });

  test("every other screen is a page of its own", () => {
    for (const screen of [
      "welcome",
      "menu",
      "options",
      "credits",
      "songs",
      "band",
      "loading",
      "results",
    ] as Screen[]) {
      expect(onStage(screen)).toBe(false);
    }
  });
});
