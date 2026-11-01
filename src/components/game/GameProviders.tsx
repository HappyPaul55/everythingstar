import { useEffect, type ReactNode } from "react";
import type { BandSetup } from "../../lib/game/band/types";
import type { Screen } from "../../lib/game/screens";
import type { Track } from "../../lib/game/track";
import type { SourceSongDoc } from "../../lib/game/source";
import type { ChannelLevels } from "../../lib/game/audio/mix";
import type { Sounds } from "./audio/useSounds";
import { StageAudioProvider } from "./audio/StageAudio";
import { PartAudioProvider } from "./band/PartAudio";
import { RunBoardProvider } from "./band/RunBoard";
import { RunModeProvider } from "./band/RunMode";
import { SongAudioStatusProvider } from "./band/SongAudioStatus";
import { SongProvider } from "./band/SongContext";
import { StageClockProvider } from "./band/StageClock";
import { StageControlsProvider } from "./band/StageControls";
import { watchGamepads } from "./band/gamepads";

/**
 * The providers every screen shares, in one place.
 *
 * They stay above the screens, which is what makes a screen change safe: the
 * **mixer**, the **clock**, the **input route** and the **run board** live above
 * the stage, so a run survives every screen change and the stage can come and go
 * with the song. The mixer is outermost because the music outlives every screen and
 * needs neither the clock nor the input route to know what to play; the part-audio
 * registry is innermost because it is the line between a run and the stems.
 *
 * The **song-audio status** sits between the mixer and the clock: the band screen's
 * loader and the clock's start gate both read the readiness of the same media
 * elements `SongAudio` plays, and neither has to ask the stage to render to know it.
 *
 * The order is deliberate — do not reorder the tower. A provider added here is one
 * line, and the children stay in the middle of the stack.
 */
interface Props {
  screen: Screen;
  sounds: Sounds;
  /** The master fader's value and setter, owned by the settings above. */
  volume: number;
  onVolume: (level: number) => void;
  /** The family levels under the master, also owned by the settings. */
  levels: ChannelLevels;
  /** Whether the room's crowd plays while the run is paused; the pause menu's alone. */
  crowd: boolean;
  setup: BandSetup;
  track: Track;
  seed: number;
  /** The song's own document, for the part rules its audio carries. */
  doc: SourceSongDoc | null;
  /** The attract demo: every seat's machine player is perfect. */
  perfect: boolean;
  /** Whether the visit has a mixer at all (the homepage preview does not). */
  audio: boolean;
  children: ReactNode;
}

export function GameProviders({
  screen,
  sounds,
  volume,
  onVolume,
  levels,
  crowd,
  setup,
  track,
  seed,
  doc,
  perfect,
  audio,
  children,
}: Props) {
  // One watcher for the whole island: the menu and the transport both ask whether
  // a pad exists, and neither should poll the browser to find out.
  useEffect(() => watchGamepads(), []);

  return (
    <RunModeProvider perfect={perfect}>
      <StageAudioProvider
        sounds={sounds.sounds}
        soundsLoading={sounds.loading}
        screen={screen}
        setup={setup}
        wordsPitched={track.melody.hasPitch}
        volume={volume}
        onVolume={onVolume}
        levels={levels}
        crowd={crowd}
        enabled={audio}
      >
        <SongAudioStatusProvider preload={screen === "band" || screen === "loading"}>
          <StageClockProvider durationMs={track.durationMs}>
            <StageControlsProvider setup={setup} track={track} screen={screen}>
              <SongProvider track={track} seed={seed} doc={doc}>
                <RunBoardProvider>
                  <PartAudioProvider>{children}</PartAudioProvider>
                </RunBoardProvider>
              </SongProvider>
            </StageControlsProvider>
          </StageClockProvider>
        </SongAudioStatusProvider>
      </StageAudioProvider>
    </RunModeProvider>
  );
}
