/**
 * The English UI dictionary — the source of truth.
 *
 * Any other locale is a partial overlay on this: a missing key falls back to
 * English, so a half-finished translation still reads sensibly. Keys are dotted
 * by area. `{name}` placeholders are filled by `t()`.
 */

export const en = {
  // Shared
  "common.skipToContent": "Skip to content",

  // Navigation and footer
  "nav.primary": "Primary",
  "nav.menu": "Menu",
  "nav.home": "Home",
  "nav.play": "Play",
  "nav.privacy": "Privacy",
  "nav.breadcrumb": "Breadcrumb",
  "footer.pages": "Pages",
  "footer.elsewhere": "Elsewhere",
  "footer.source": "Source",
  "footer.licence": "{licence} licence",
  "footer.private": "// no accounts, no cookies, no trackers",
  "footer.nav": "Footer",

  // Landing
  "home.comment": "the band game made of games",
  "home.titleBefore": "One stage, every way to",
  "home.titleMark": "play",
  "home.titleAfter": ".",
  "home.lede":
    "Three ways to play on one stage: guitar, bass, keys and drums; the words typed on a keyboard; and karaoke into a microphone. Play in your browser, on a desktop or a phone.",
  "home.ctaPlay": "Play",
  "home.ctaPrivacy": "Privacy",
  "home.stageDemo": "The EverythingStar stage, playing itself",
  "home.stageCaption": "the band plays itself",
  "home.stagePlay": "Play EverythingStar",

  // The three ways to play (the combined vision)
  "home.modesComment": "three ways to play",
  "home.modesLede":
    "One stage, three ways to play. The instrument way is guitar, bass, keys and drums; Typing is the words on your keyboard; Vocals is karaoke. The same notes work on a phone — tap the pads instead of strumming.",
  "mode.instrumentsTitle": "Instruments",
  "mode.instrumentsBody":
    "Guitar, bass, keys and drums as falling note lanes. Chords, hopos, sustains and the whammy — drums play the same highway, mapped to pads.",
  "mode.typeTitle": "Typing",
  "mode.typeBody":
    "The words on screen and your keyboard. Type each word as it arrives — a touch-typing duel against the beat.",
  "mode.karaokeTitle": "Vocals",
  "mode.karaokeBody":
    "Karaoke on the same stage. Follow the words that light up, sung into a microphone — with or without a score, a mic optional.",
  /* The parts named on the welcome screen's marquee strip: every instrument is
     default, and only the words' place (Vocals) wears the accent. */
  "mode.shortGuitar": "Guitar",
  "mode.shortBass": "Bass",
  "mode.shortKeys": "Keys",
  "mode.shortDrums": "Drums",
  "mode.shortTyping": "Typing",
  "mode.shortKaraoke": "Vocals",

  // Status band
  "home.statusComment": "status",
  "home.statusTitle": "Playable now, still growing",
  "home.statusBody":
    "All three ways are playable now — guitar, bass, keys and drums, the words typed or sung — with the free EverythingStar FOSS library, a full band setup and local scores.",
  "home.statusCta": "Open the play area",

  // Play page
  "play.heading": "The stage",

  // The screens around a run (welcome, songs, band, a run, results —
  // see src/lib/game/screens.ts)
  "screen.preview": "preview build",
  "screen.welcomeTitle": "EverythingStar",
  "screen.welcomeModes": "Ways to play",
  /* What the welcome's wordmark is renamed to while a part's pill is hovered:
     the part, made into a game of its own ("GuitarStar"). */
  "screen.welcomeWordGuitar": "Guitar",
  "screen.welcomeWordBass": "Bass",
  "screen.welcomeWordKeys": "Key",
  "screen.welcomeWordDrums": "Drum",
  "screen.welcomeWordTyping": "Typing",
  "screen.welcomeWordKaraoke": "Vocal",
  "screen.enter": "Enter the stage",
  "screen.enterLoading": "Loading…",
  "screen.loading": "Loading the song…",
  "screen.preloadProgress": "Loading {done} of {total} files…",
  "screen.preloadStalled":
    "Still loading the song — you can start without the rest, or go back and wait.",
  "screen.playAnyway": "Play anyway",
  "screen.audioFailed": "{name} did not load — that part will be missing.",
  "screen.ready": "Get ready",

  // The menu, and the two branches off it: the board the welcome opens on to
  "screen.menuTitle": "Main menu",
  "screen.menuComment": "pick a door",
  "screen.quickPlay": "Quick Play",
  "screen.quickPlayHint": "Pick a song, then a band",
  "screen.options": "Options",
  "screen.optionsHint": "Sound, notes, backdrop, players",
  "screen.credits": "Credits",
  "screen.creditsHint": "Who made it, and with what",

  // The options page: the settings that are nobody's but this browser's
  "screen.optionsLede":
    "These belong to this browser rather than to any one song, and they are kept here.",
  "screen.install": "Install the game",
  "screen.installHint":
    "Keep EverythingStar on this device. It opens without the browser's bars and plays offline; songs you download are kept too.",
  "screen.installAction": "Install",
  "screen.installOpening": "Opening…",
  "screen.installInstalled":
    "Installed on this device. EverythingStar opens as its own app.",
  "screen.installIos": "On iPhone or iPad: Share → Add to Home Screen.",
  "screen.installMenu":
    "Your browser installs from its own menu — look for Install or Add to Home Screen.",
  "screen.installDismissed": "No problem — EverythingStar is still in your browser.",
  "screen.installFailed": "The install prompt did not open. Use your browser's menu instead.",

  // A player's profile: the four local records as one file
  "profile.title": "Your profile",
  "profile.hint":
    "Your settings, band, scores and first-run hints live in this browser, with no account. A profile is those four records as one file you can carry to another browser.",
  "profile.notIncluded":
    "The library, downloads and audio are not in a profile — they stay where they are, in this browser.",
  "profile.export": "Export profile",
  "profile.exported": "Saved {name}.",
  "profile.import": "Import profile",
  "profile.confirmLabel": "Replace this browser's profile?",
  "profile.confirm": "Replace this browser's settings, band, scores and hints?",
  "profile.confirmHint":
    "The four records this browser holds are overwritten, and the page reloads. The library, downloads and audio are untouched.",
  "profile.replace": "Replace",
  "profile.cancel": "Cancel",
  "profile.problem.tooLarge":
    "That file is over 1 MB, so it is not a profile. Nothing was changed.",
  "profile.problem.notJson":
    "That file is not JSON, so it is not a profile. Nothing was changed.",
  "profile.problem.notObject": "That file is not a profile. Nothing was changed.",
  "profile.problem.wrongFormat":
    "That is not an EverythingStar profile. Nothing was changed.",
  "profile.problem.wrongVersion":
    "That profile was made by a different version of the game. Nothing was changed.",
  "profile.problem.missingSettings":
    "That profile has no settings. Nothing was changed.",
  "profile.problem.missingBand": "That profile has no band. Nothing was changed.",
  "profile.problem.missingBoard":
    "That profile has no score board. Nothing was changed.",
  "profile.problem.readFailed":
    "That file could not be read. Nothing was changed.",
  "screen.audioLag": "Audio lag",
  "screen.audioLagHint":
    "How far behind the notes you hear the song — for a TV, a soundbar or headphones that add a delay of their own. Nudge it until the two land together.",
  "screen.audioLagCalibrateHint":
    "Calibrate measures it with eight clicks; the stepper stays for fine tuning and as the fallback.",
  "screen.pictureLag": "Picture lag",
  "screen.pictureLagHint":
    "How far behind the sound the picture is — for a display, a TV or a projector that shows a frame late. Positive means the screen lags, so the notes are drawn that much earlier to meet what you hear. Only the scrolling notes move; the clock and the judging do not.",
  "screen.pictureLagCalibrateHint":
    "Calibrate measures it with a marker crossing a line twelve times; the stepper stays for fine tuning and as the fallback.",
  "screen.lagEarlier": "Earlier",
  "screen.lagLater": "Later",
  "screen.calibrate": "Calibrate",
  "screen.calibratePicture": "Calibrate the picture lag",
  "screen.calibrationTitle": "Calibrate the audio lag",
  "screen.calibrationMode": "What to measure",
  "screen.calibrationModeSound": "Sound",
  "screen.calibrationModePicture": "Picture",
  "screen.pictureCalibrationTitle": "Calibrate the picture lag",
  "screen.calibrationIntro":
    "You will hear a run of clicks about three-quarters of a second apart, after a short lead-in. Tap in time with each click — eight clean taps are enough.",
  "screen.pictureCalibrationIntro":
    "A marker will sweep across the track and cross the line twelve times, about 0.7 seconds apart, after a short lead-in. Tap as it crosses — eight clean taps are enough.",
  "screen.calibrationFixedLevel":
    "The clicks play at their own fixed level, so a muted master cannot make the calibration silent.",
  "screen.pictureCalibrationNoSound":
    "No sound plays in this test: the marker crossing the line is the beat, and a click would give it away.",
  "screen.calibrationStart": "Start",
  "screen.calibrationTap": "Tap",
  "screen.calibrationTapHint":
    "Tap on the click — Space or a pad's A works while the button is focused.",
  "screen.pictureCalibrationTapHint":
    "Tap as the marker crosses the line — Space or a pad's A works while the button is focused.",
  "screen.calibrationProgress": "{count} of {total} taps",
  "screen.calibrationResult": "Measured audio lag",
  "screen.pictureCalibrationResult": "Measured picture lag",
  "screen.calibrationTooFew":
    "Not enough clean taps to measure. Have another go, or set it with the stepper.",
  "screen.calibrationUnavailable":
    "This browser would not start the calibration sound. The stepper still sets the lag by hand.",
  "screen.calibrationUse": "Use this",
  "screen.calibrationAgain": "Try again",
  "screen.calibrationCancel": "Cancel",
  "screen.volume": "Volume",
  "screen.volumeHint":
    "The master. The music, the room and the cues sit under it, each with its own level.",
  "screen.musicLevel": "Music",
  "screen.musicLevelHint":
    "The song and the menu beds, under the master. The song's own stems are music too, so this is where a run's backing sits.",
  "screen.ambienceLevel": "Ambience",
  "screen.ambienceLevelHint":
    "The room's murmur while the run is paused, kept apart from the music and the cues.",
  "screen.sfxLevel": "Sound effects",
  "screen.sfxLevelHint":
    "The cues: clicks, stings and the feedback a run gives you, under the master.",
  "screen.guideVocal": "Guide vocal",
  "screen.guideVocalHint":
    "Play the song's own voice even while somebody is singing it. Off is karaoke — a singer is the voice — while on lets their own part drop out on a miss and come back by the song's own rule, so their misses can be heard.",
  "screen.guideVocalOn": "On",
  "screen.guideVocalOff": "Off",
  "screen.backdrop": "Backdrop",
  "screen.backdropHint":
    "What the stage sits in front of, when the song has something of its own.",
  "screen.backdropSong": "The song's own",
  "screen.backdropOurs": "The game's artwork",
  "screen.backdropDim": "Backdrop dim",
  "screen.backdropDimHint":
    "Darkens the backdrop — a song's video, its art or the game's own room — so bright footage is easier to play over. The notes and the panels keep their own brightness.",
  "screen.flares": "Drifting lights",
  "screen.flaresHint":
    "The slow glow that drifts over the backdrop. Turn it off for a still room; it changes nothing about the song.",
  "screen.flaresOn": "On",
  "screen.flaresOff": "Off",
  "screen.crowd": "Crowd",
  "screen.crowdHint":
    "The murmur of a venue while the run is paused, on its own channel. The run itself is the song; the pause is the only screen with a crowd.",
  "screen.crowdOn": "On",
  "screen.crowdOff": "Off",
  "screen.view": "Note view",
  "screen.viewHint":
    "How the necks are drawn. The tilted one recedes into the song, so it shows more of what is coming; the flat one keeps every note the same size. Judging is identical either way.",
  "screen.viewFlat": "Flat",
  "screen.view3d": "In perspective",
  "screen.noteStyle": "Note style",
  "screen.noteStyleHint":
    "How the notes are drawn on the neck: flat bars, rounded gems, or a dance mat's arrows — four directions on a four-column chart, and five panels on a five-column one. Drawing only: the chart, the clock and the judging are the same.",
  "screen.noteStyleBars": "Bars",
  "screen.noteStyleGems": "Gems",
  "screen.noteStyleArrows": "Arrows",
  "screen.noteSpeed": "Note speed",
  "screen.noteSpeedHint":
    "How fast the notes travel down the neck. Higher shows less of the song at once. It changes the drawing only — the chart, the clock and the judging are the same at any speed.",
  "screen.tap": "Tap the pads",
  "screen.tapHint":
    "Tap a hit marker to play the note above it. A tap counts as a strum, so hammer-ons and pull-offs need no thought, and two fingers on a chord only have to land within a moment of each other. It is the way to play on a phone; the pads stay decorative when it is off, and keys and gamepads work either way.",
  "screen.tapOn": "On",
  "screen.tapOff": "Off",
  "screen.haptics": "Haptics",
  "screen.hapticsHint":
    "A short buzz when a note is missed, and a stronger pattern when star power is spent. It reaches the gamepad in that player's hands where the pad can rumble. A device or browser without haptics simply stays quiet, and nothing about the judging changes.",
  "screen.hapticsOn": "On",
  "screen.hapticsOff": "Off",
  "screen.keepAwake": "Keep screen awake",
  "screen.keepAwakeHint":
    "Holds the display on while a run is moving, and lets it go on a pause or the results. A browser without the screen wake lock, or one saving battery, simply lets the screen sleep as it always did.",
  "screen.keepAwakeOn": "On",
  "screen.keepAwakeOff": "Off",
  "screen.players": "Player setup",
  "screen.playersHint":
    "What each of them plays with. Controls can be learned here or from the gear on the band screen, and are remembered. Add players on the band screen.",
  "screen.seatWords": "The words",
  "screen.seatWordsDevice": "set on the band screen",
  "screen.seatEmpty": "not playing",
  "screen.backToMenu": "Back to the menu",

  // The credits: read from the sound manifest where it can be
  "screen.creditsLede": "What the game is made of, and by whom.",
  "screen.creditGame": "the game",
  "screen.creditSource": "the source",
  "screen.creditAudio": "the music and the cues",
  "screen.creditOneFile": "one file",
  "screen.creditFiles": "{count} files",
  "screen.creditUnrecorded": "{count} files with no credit written down yet.",
  "screen.creditFonts": "the fonts",
  "screen.creditFontsWho": "Space Grotesk, Space Mono and Permanent Marker, self-hosted.",
  "screen.creditArt": "the artwork",
  "screen.creditArtWho": "the game's own backdrop and cover tiles.",
  "screen.creditLicence": "the licence",
  "screen.creditTools": "the tools",
  "screen.creditToolsWho": "Astro, React, Tailwind and Bun.",

  // The jukebox
  "screen.songsTitle": "Pick a song",
  "screen.searchLabel": "find a song",
  "screen.searchPlaceholder": "a title, an artist or an album",
  "screen.noMatches": "Nothing by that name.",
  "screen.jukeboxIndex": "Jump to a letter",
  "screen.nowPlaying": "now playing",
  "screen.nextBand": "Next: your band",
  "screen.nextShort": "Next",
  "screen.noScoreYet": "no score yet",
  "screen.historyPlayed": "played",
  "screen.historyPlayers": "players",
  "screen.historyScore": "score",
  "screen.songCount": "{count} songs",
  "screen.songByAlbum": "{artist} — “{album}”",
  "screen.libraryLoading": "Reading the playlists…",
  "screen.songsLoading": "Loading…",
  "screen.libraryEmpty": "Nothing to play yet. Add a playlist to get started.",
  "screen.libraryEmptySearch": "Nothing to play yet. Search above to find a song.",
  "screen.searchingOne": "Searching the playlist…",
  "screen.searchingMany": "Searching {count} playlists…",
  "screen.searchShort": "Keep typing to search the playlists.",
  "screen.searchFailed": "Could not search {name}.",
  "screen.searchRetry": "Try again",

  // Songs saved for offline play. The installed game's service worker serves the
  // Cache Storage bucket these controls write, in the browser and in the native
  // shell alike; the action only renders when a worker is actually in control.
  "screen.downloads": "Downloads",
  "screen.download": "Download",
  "screen.downloading": "Downloading {done} of {total}",
  "screen.downloaded": "Downloaded",
  "screen.downloadRetry": "Retry",
  "screen.downloadCancel": "Cancel download",
  "screen.downloadRemove": "Remove",
  "screen.downloadsLead":
    "Songs saved on this device. They play without a connection.",
  "screen.downloadsEmpty":
    "No songs downloaded yet. Pick a song in the jukebox and press Download.",
  "screen.downloadsStorage": "{used} of {quota} used",
  "screen.downloadsPersistWarning":
    "This device may clear downloads when storage is low.",
  "screen.downloadClearAll": "Clear all downloads",
  "screen.downloadClearConfirm": "Press again to clear all downloads",
  "screen.downloadLocal": "This song is already on this device.",
  "screen.downloadYouTube": "YouTube-backed songs can't be downloaded.",
  "screen.downloadFailed":
    "The download failed. Check your connection and try again.",
  "screen.downloadQuota": "There isn't enough storage for this song.",
  "screen.downloadUnsupported": "Downloads aren't available here.",
  "screen.downloadApp": "App",
  "screen.downloadGame": "Game",
  "screen.downloadWebView": "WebView",

  // The playlists themselves: where the songs come from.
  "screen.playlists": "Playlists",
  "screen.playlistsLead": "Songs come from playlists",
  "screen.playlistsNone": "No playlists at all — put the default one back, or add your own below.",
  "screen.playlistRestore": "Add the default playlist",
  "screen.addPlaylist": "Add a playlist",
  "screen.playlistUrl": "https://example.com/playlist.json",
  "screen.playlistAdd": "Add",
  "screen.playlistHost": "From {host}",
  "screen.playlistUrlInvalid": "Enter a full http:// or https:// address.",
  "screen.playlistInsecure":
    "This page is https, so the browser will block an http:// playlist — use an https address.",
  "screen.playlistSongs": "{count} songs",
  "screen.playlistOneSong": "one song",
  "screen.playlistOnDemand": "on demand",
  "screen.playlistOnDemandHint":
    "Asked for a song when you search the jukebox. What it finds lasts for this visit.",
  "screen.playlistLoading": "reading…",
  "screen.playlistNever": "never read",
  "screen.playlistFetched": "read {when}",
  "screen.playlistCached": "cached",
  "screen.playlistCachedError": "the last refresh failed: {error}",
  "screen.playlistStale": "an old copy — refresh it",
  "screen.playlistFailed": "could not be read",
  "screen.playlistProblems": "{count} problems",
  "screen.playlistDuplicates":
    "{count} songs were already in another playlist, and the first one wins",
  "screen.playlistRefresh": "Refresh",
  "screen.playlistDisable": "Disable",
  "screen.playlistEnable": "Enable",
  "screen.playlistRemove": "Remove",
  "screen.playlistCopyLink": "Copy link",
  "screen.playlistCopied": "Link copied",
  "screen.playlistCopyFailed": "The link could not be copied.",
  "screen.playlistDisabled": "disabled",
  "screen.playlistDefaultName": "EverythingStar FOSS",
  "screen.refreshAll": "Refresh all",
  "screen.close": "Close",

  // A song document added from a link, with no playlist around it.
  "screen.pinnedLead": "Songs from links",
  "screen.pinnedUnreadable": "could not be read",

  // A link opening the game: /open, /open?playlist=…, /open?song=…
  "screen.intentPlaylistTitle": "Add this playlist?",
  "screen.intentSongTitle": "Add this song?",
  "screen.intentAddedTitle": "Added",
  "screen.intentFrom": "From {host}.",
  "screen.intentPlaylistHint":
    "EverythingStar will fetch it, and its songs will join your library.",
  "screen.intentSongHint":
    "The song document will be kept in your library on its own.",
  "screen.intentAdd": "Add",
  "screen.intentNotNow": "Not now",
  "screen.intentAdding": "Adding…",
  "screen.intentPlaylistAdded": "{name} added.",
  "screen.intentSongAdded": "{title} added.",
  "screen.intentAlready": "That is already in your library.",
  "screen.intentAlreadyTitle": "Already in your library",
  "screen.intentFailed": "That could not be added.",
  "screen.intentTryAgain": "Try again",
  "screen.intentInvalidTitle": "That link can't be added",
  "screen.intentInvalidUrl":
    "A link has to be a full http:// or https:// address.",
  "screen.intentInvalidLong":
    "That link is too long to be one playlist or song address.",
  "screen.intentInvalidBoth": "That link names a playlist and a song at once.",

  // A folder of charts on this machine, read directly rather than served.
  "screen.foldersLead": "Or read a folder of charts from this machine",
  "screen.openFolder": "Open a folder…",
  "screen.openFolderHint":
    "The game reads the charts where they are — nothing is uploaded and nothing is copied. Folders are remembered, and the browser asks for permission again after a reload.",
  "screen.folderReading": "reading…",
  "screen.folderNoSupport": "This browser cannot open a folder — add a playlist by URL instead.",
  "screen.folderForget": "Close folder",
  "screen.folderLocked": "permission needed",
  "screen.folderLockedHint":
    "A reload takes the browser's permission to read this folder away. Press Reconnect, and it will ask again — the songs stay listed either way.",
  "screen.folderReconnect": "Reconnect",
  "screen.folderReconnecting": "reading again…",
  "screen.folderReconnectDenied":
    "The browser did not give permission to read this folder. Press Reconnect to ask again.",
  "screen.folderReconnectFailed":
    "That folder could not be read again. Its songs are still listed — try Reconnect once more.",
  "screen.folderCopying": "copying {copied} of {total} files…",
  "screen.folderImportedHint":
    "Copied into this browser's storage. Closing the folder deletes the copy.",

  // Importing, for browsers with no folder picker (and anybody who would rather drop).
  "screen.importFiles": "Import files",
  "screen.importFolder": "Import a folder",
  "screen.importHint":
    "Choose .sng packages, or a song's chart, audio and art files. The files are copied into this browser's storage — nothing is uploaded.",
  "screen.importNoSupport":
    "This browser cannot store imported files. Use Open a folder or add a playlist by URL.",
  "screen.importDrop": "Drop files or a folder here",
  "screen.importDropActive": "Drop to import",
  "screen.importPreparing": "Checking the files…",
  "screen.importCopying": "Copying {copied} of {total} files…",
  "screen.importReading": "Reading the imported files…",
  "screen.importUnsupported":
    "This browser cannot store imported files. Use Open a folder or add a playlist by URL.",
  "screen.importEmpty":
    "Nothing in that selection can be imported. Choose a .sng package or a folder of charts.",
  "screen.importTooLarge":
    "That is over the 512 MB import limit. Choose a smaller folder or fewer files.",
  "screen.importNoSpace":
    "There is not enough room in this browser for that import. Free some site data, or choose a smaller folder.",
  "screen.importFailed":
    "Those files could not be copied. Nothing was kept — try again.",

  "song.duet": "duet",
  "song.vocals": "vocals",
  "song.lyrics": "lyrics",

  // The band
  "screen.bandTitle": "Who is playing?",
  "screen.bandLede": "“{title}” by {artist}. A slot each — what they play, and how hard.",
  "screen.playersLabel": "Players",
  "screen.playsLabel": "Player {n}: what they take",
  "screen.howHardLabel": "Player {n}: how hard",
  "screen.removePlayer": "Remove player {n}",
  "screen.joinSlot": "Player {n} — join the band",
  "screen.addRow": "Add more players",
  "screen.noPartHere": "not in this song",
  "screen.freePlay": "free play",
  /* The words box on a song whose words carry no pitch: what it *is* ("Lyrics") and
     what you do with it, because "no difficulty" is not the same as "nothing to do". */
  "screen.typedFreePlay": "typed — free play",
  "screen.bandNothing": "None of this band has a part in this song. Change who is playing, or pick another song.",
  "screen.handsHint": "One keyboard: the first instrument and the first typist share it; everyone else plays themselves.",
  "screen.play": "Play",
  "screen.listen": "Listen",
  "screen.backToSongs": "Back to songs",
  "screen.bandListenHint": "No players on stage? Start the song anyway.",

  "screen.learn": "Set it up",
  "screen.learnReset": "Use the preset",
  "screen.learnHint": "You will be asked for {count} frets, then the strum and the whammy.",
  "screen.learnFret": "the {colour} fret · {n}",
  "screen.learnKick": "the kick pedal",
  "screen.learnArrow": "arrow {n}",
  "screen.fretColour1": "green",
  "screen.fretColour2": "red",
  "screen.fretColour3": "yellow",
  "screen.fretColour4": "blue",
  "screen.fretColour5": "orange",
  "screen.learnStrum": "the strum",
  "screen.learnStrumBack": "the strum, the other way",
  "screen.learnWhammy": "the whammy",
  "screen.learnNow": "press it now",
  "screen.learnKeyboard": "on the keyboard",
  "screen.learnPad": "press a button or move the strum bar on the pad you want to use",
  "screen.learnMidi": "press a pad or a key, or move a pedal, on your MIDI kit",
  "screen.learnTaken": "that one is taken - press another",
  "screen.learnSkip": "Skip",
  "screen.learnCancel": "Cancel",
  "screen.learnDone": "that is the lot",
  "screen.controllerFor": "Player {n}: controller",
  "screen.device": "what they play with",
  "screen.deviceKeyboard": "Keyboard",
  "screen.deviceMachine": "The machine",
  "screen.deviceMidi": "MIDI keyboard or kit",
  "screen.deviceTyping": "Keyboard (typing)",
  "screen.deviceWords": "The song decides how the words are played - sung, or typed. A player can only sit this one out.",
  "screen.midiAsking": "Asking the browser for MIDI…",
  "screen.midiUnavailable":
    "MIDI is not available in this browser. The keyboard and a gamepad still work.",
  "screen.midiRefused":
    "MIDI access was not given, so this seat keeps what it had. Your kit is not being read.",
  "screen.midiError":
    "MIDI could not be started. The keyboard and a gamepad still work.",
  "screen.midiInputs": "MIDI inputs seen: {names}",
  "screen.midiNoInputs":
    "MIDI is allowed, but no input is connected yet. Plug your kit in and it will appear.",
  "screen.midiNotConnected":
    "MIDI is set for this seat. Press MIDI to let the browser connect your kit for this visit.",
  "screen.padNotConnected":
    "Pad {n} is not connected. Plug it in, or choose another device.",
  "screen.midiNote": "note {note} · channel {channel}",
  "screen.midiCc": "CC {cc} · channel {channel}",
  "screen.mapping": "their controls",
  "screen.mappingNone": "nothing - the machine plays them",
  "screen.mappingPreset": "the preset for their place",
  "screen.paused": "Paused",
  "screen.resume": "Resume",
  "screen.restart": "Start again",
  "screen.quit": "Leave the stage",
  "screen.pauseHint": "Escape or Start resumes.",
  "pause.quick": "Quick settings",
  "pause.noteSpeed": "Note speed",
  "pause.speedSlower": "Slower",
  "pause.speedFaster": "Faster",
  "pause.audioLag": "Audio lag",
  "pause.guideVocal": "Guide vocal",
  "pause.practiceHere": "Practice this section",

  // The practice dialog over the pause, and its stage read-out
  "practice.label": "Practice",
  "practice.open": "Practice",
  "practice.title": "Practice a stretch",
  "practice.lede":
    "Start at a section and play it slower. Practice is not scored and never reaches the results, so nothing here goes on the board.",
  "practice.section": "Which stretch",
  "practice.speedLabel": "Speed",
  "practice.speed": "{speed}% speed",
  "practice.loop": "Loop this stretch",
  "practice.loopHint":
    "A loop starts each pass again from the top of the stretch. Turn it off to stop exactly at its end.",
  "practice.loopOn": "looping",
  "practice.loopOff": "one pass",
  "practice.start": "Start practice",
  "practice.cancel": "Cancel",
  "practice.stop": "Stop practice",
  "practice.noSection": "This song has no stretch to practise yet.",
  "practice.wholeSong": "Whole song",

  "screen.results": "Results",
  "screen.runOver": "Run over",
  "screen.resultsComment": "the run",
  "screen.resultsBy": "by {artist}",
  "screen.failed": "The band lost it",
  "screen.total": "band score",
  "screen.best": "this band's best {score}",
  "screen.newBest": "A new best for this band",
  "screen.noBest": "First run for this band",
  "screen.replay": "Play again",
  "screen.changeSong": "Change song",
  "screen.hits": "notes hit",
  "screen.accuracy": "accuracy",
  "screen.bestCombo": "best combo",
  "screen.stars": "{n} of 5 stars",
  "screen.goldStars": "Gold stars",
  "screen.noRating": "No rating",
  "screen.averageMultiplier": "average multiplier",
  "screen.countOf": "{hits}/{total} {unit}",
  "screen.notes": "notes",
  "screen.words": "words",
  "screen.typingWpm": "{wpm} WPM",
  "screen.typingAccuracy": "{accuracy}% key accuracy",
  "screen.whoPlayed": "who played what",
  "screen.savedTop": "your last {count} on this song",
  "screen.savedBand": "band of {count}",
  "screen.lost": "run over",

  // The brag card: a finished run as a poster
  "brag.action": "Brag card",
  "brag.title": "Brag card",
  "brag.lede":
    "This run as a poster you can keep or post. It carries the song, the score and the stars — not the song's artwork.",
  "brag.previewAlt": "The brag card for {title}",
  "brag.download": "Download",
  "brag.share": "Share",
  "brag.copy": "Copy text",
  "brag.copied": "Copied. The card is still here to download.",
  "brag.shared": "Shared.",
  "brag.copyFailed": "This browser would not copy. The card can still be downloaded.",
  "screen.singer": "Singer {n}",
  "screen.typist": "Typist {n}",

  // The band (the game layout: regions, panels and rails)
  "band.guitar": "Guitar",
  "band.leadGuitar": "Lead guitar",
  "band.rhythmGuitar": "Rhythm guitar",
  "band.bass": "Bass",
  "band.drums": "Drums",
  "band.simpleKeys": "Simple keys",
  "band.dance": "Dance",
  "band.player": "Player {n}",
  "band.score": "score",
  "band.partScore": "part {n} {role} score",
  "band.sing": "singing",
  "band.type": "Typing",
  "band.combo": "combo",
  "band.multiplier": "multiplier",
  "band.success": "success",
  "band.starPower": "star power ×2",
  "band.highway": "Note highway",
  "band.column": "Column {n}",
  "band.kick": "Kick pedal",
  "band.strum": "strum",
  "band.fill": "Fill!",
  "band.noChart": "No chart for this instrument",
  "band.playersLabel": "Players",
  "band.melody": "The melody",
  "band.words": "Words",
  "band.vocals": "Vocals",
  "band.easy": "easy",
  "band.normal": "normal",
  "band.hard": "hard",
  "band.expert": "expert",
  "band.auto": "auto",
  "band.mic": "Microphone",
  "band.micOff": "not asked for yet",
  "band.micAsked": "asking",
  "band.micOn": "listening",
  "band.micRefused": "refused - the singers play themselves",
  "band.micFailed": "unavailable",
  "band.sounds": "sounds",
  "band.soundsLoading": "reading the manifest…",
  "band.soundsCount": "{have} of {total} · {types} types",
  "band.reload": "reload",
  "band.volume": "volume",
  "band.music": "music",
  "band.musicOff": "off",
  "band.songAudio": "song audio",
  "band.stems": "{have} of {total} stems",
  "band.noStems": "the song names no audio",
  "band.stemsUnread": "{count} of the stems could not be read",
  "band.stemsFailed": "{count} of the stems failed to load",
  "band.stemSpread": "stem spread",
  "band.autoplay": "autoplay",
  "band.playRefused": "the browser refused to play",
  "band.motion": "motion",
  "band.motionFull": "animated",
  "band.motionReduced": "reduced — the browser asked for less",
  "band.keysLabel": "Keys",
  "band.controllers": "controllers",
  "band.noPads": "No gamepad - press a button on one and it joins.",
  "band.padOn": "Gamepad {n}",
  "band.padOdd": "Gamepad {n} - not a standard mapping",
  "band.share": "Player {a} and Player {b} share {keys}",
  "band.shareWhy": "One keyboard cannot tell two people apart, so both get the press.",
  "band.singers": "singers ×{count}",
  "band.typists": "typists ×{count}",
  "band.freeform": "freeform",
  "band.video": "video",
  "band.on": "on",
  "band.off": "off",
  "band.progress": "song progress",
  "band.dev": "dev",
  "band.devPanel": "dev",
  "band.screenLabel": "screen",
  "band.screen.welcome": "welcome",
  "band.screen.menu": "menu",
  "band.screen.options": "options",
  "band.screen.credits": "credits",
  "band.screen.songs": "songs",
  "band.screen.band": "band",
  "band.screen.loading": "loading",
  "band.screen.countdown": "entrance",
  "band.screen.playing": "playing",
  "band.screen.paused": "paused",
  "band.screen.results": "results",
  "band.humansLabel": "by hand",
  "band.play": "play",
  "band.pause": "pause",
  "band.restart": "restart",
  "band.seek": "seek",
  "band.fps": "{fps} fps",
  "band.noteCount": "{count} notes",
  "band.fullscreen": "Fullscreen",
  "band.exitFullscreen": "Exit fullscreen",
  "band.tooSmall":
    "Not enough room for this many players — remove a player or rotate your device.",

  // 404
  "notFound.comment": "404 · not found",
  "notFound.title": "Page not found",
  "notFound.titleBefore": "That track didn't",
  "notFound.titleMark": "load",
  "notFound.titleAfter": ".",
  "notFound.body":
    "The link may be broken, or the page has moved. Head back home, or step into the play area.",
  "notFound.home": "Back to home",
  "notFound.play": "Open the play area",

  // Site copy
  "site.tagline": "One stage, every way to play",
  "site.description":
    "A free browser rhythm game on one stage: instruments on guitar, bass, keys and drums, lyric typing on a keyboard, and karaoke. No account needed.",

  // Metadata: what a search result and a social card say. The home and play
  // titles lead with the brand or the verb, so the brand is a placeholder here;
  // the secondary pages get theirs from `pageTitle` in src/lib/seo.ts. Every
  // description says what the page is in its own words — a page that reuses the
  // site's description tells a reader nothing new.
  "seo.titleHome": "{name} — browser rhythm game",
  "seo.titlePlay": "Play {name} — free browser rhythm game",
  "seo.titleOpen": "Open in {name}",
  "seo.descriptionHome":
    "A free browser rhythm game: guitar, bass, keys and drums, lyrics typed on a keyboard, and karaoke. Three ways to play — no account, no download.",
  "seo.descriptionPlay":
    "Pick a song, build a band and play EverythingStar in your browser — instrument lanes, lyric typing or karaoke. Free, no account, nothing to install.",
  "seo.descriptionNotFound":
    "That page is not here — the link may be broken, or the page has moved. Head back home, or open EverythingStar's play area.",
  "seo.ogAlt":
    "{name} — a yellow “E” tile beside the title on a black graffiti backdrop, with Instruments, Typing and Karaoke chips and the line “one stage, three ways to play”",
  "seo.requiresJs": "Requires JavaScript",
  "seo.sitemap": "Sitemap",
  "privacy.updated": "Last updated {date}",
} as const;

export type MessageKey = keyof typeof en;
