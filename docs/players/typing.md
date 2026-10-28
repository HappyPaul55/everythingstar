---
title: Typing
description: "Typing the words in EverythingStar: the three levels, what counts as a mistake, the forgiving skips and the words-a-minute read-out."
updated: "2026-10-28"
order: 4
---

Typing is the words on your keyboard. On a song that carries pitch, a words player can choose **sing** or **Type**; on a song with no pitch, typing is the only way to play the words. The words arrive with the music, and you type each one as it is due.

A typist keeps their own score, combo and run. Nothing another player does reaches it.

## What you see

The words are on the melody region, above the instrument panels. On a pitched song with a singer, they ride under the note bars, so the singer reads the pitch and the word in the same place and a typist reads whole words in the line strips below. On a song with no singer — or a pitched song whose words players all chose Type — the words fill the region in the lyrics view and do not scroll.

The word you are on is marked character by character: the ones you have typed are done, the next one is the caret, and the rest are still to come. A finished word moves the run on at once.

## The three levels

Typing is more or less strict depending on its level. The rules are the same at every level; only what counts towards a word changes.

- **Easy** wants the **first character** of each word. `Tonight` is `t`, and the rest is yours to ignore.
- **Normal** wants the **whole word**, with punctuation and accents optional. `Tonight!` is `tonight`, and `Café` is `cafe`. Punctuation and symbols are not typed; the letters and digits are.
- **Hard** wants the **whole word with its punctuation and accents**, so `Tonight!` needs the `!` and `Café` needs the `é`. Spaces are never typed. Case is still not strict: `tonight` and `Tonight` are the same word.

Nothing is case-sensitive at any level. Shift is never a wrong answer.

**What the band screen asks.** Typing has its own three levels, deliberately separate from an instrument's four: nobody types an Expert chart. In this build a typist plays at **Normal**, which the band screen calls **typed — free play** — for a pitched song and a lyrics-only song alike. The level buttons on the box are the song's charts, not a typing level; a lyrics-only song has none and is free play.

## The forgiving rules

Typing against a song is not a spelling test with a buzzer. Three rules keep it fair:

- **A key can skip ahead.** If a key cannot continue the word you are on but does begin a later word that is open, you jump to that word. The words you passed over are missed and your chain breaks, but the run carries on. The search runs to the end of the line and then to the first word of the next, so the tail of a word — or the end of a line — can never trap you.
- **A line opens early and holds late.** A line can be typed from up to a second before its first word, but never before the previous line has finished. Its last word stays typeable for up to a second into the gap after it, or until the next line begins, whichever comes first.
- **A line opens together.** Only the line's own timing is real, so once a line opens, every word in it can be typed. A fast typist is never blocked part-way through a line waiting for the next word to unlock.

## What counts as a mistake

- **A wrong key** is an error. The word stays where it is and what you had typed of it is cleared, so you can try again; the error is counted on your read-out.
- **A skip** is an error on the key that made it, and the words passed over are misses.
- **A word whose time runs out** is a miss, not an error: nobody did anything. A miss resets your combo.
- **A key that means nothing at the level** is ignored rather than counted. At Normal, a full stop is a key the word has no use for; punctuation and symbols are what Easy and Normal ignore.
- **<kbd>Backspace</kbd> is free.** It edits what you have typed and is never counted, and neither is a key pressed before its word opens.

Control, Command and Alt combinations are left to the browser — <kbd>Ctrl</kbd>+<kbd>R</kbd> still reloads — and a key that is not a single character, such as an arrow or <kbd>F5</kbd>, is not a typing key. An unfinished input-method composition has not arrived yet and is ignored until it does.

## Words and score

A word is worth **50 points**, a **hero** word five times its own, and the same streak multiplier as an instrument: ×1, ×2, ×3 and ×4 at 0, 10, 20 and 30 words. A miss resets the chain. The words are judged on being completed in their window, not on how fast you typed them within it.

## The read-out at the end

A typist's results card carries two numbers from the run's own keystrokes:

- **Words a minute** — five characters to a word, over the span from the first meaningful key to the last. That span has a one-second floor, so a burst of two keys cannot read as thousands of words a minute.
- **Key accuracy** — the share of meaningful keys that were right. Correct characters and wrong ones count; <kbd>Backspace</kbd>, ignored keys and keys before a word opened do not.

A typist who never touched the keyboard has no rate to report rather than a zero. Neither number is used in judging; they are a read-out of how the typing went.

## Pitched songs and lyrics-only songs

On a **pitched** song, a words player chooses Vocals or Typing. Both read the same words and keep independent scores; the melody region uses the keys view while somebody is singing, and a typist's whole words ride below the bars.

On a **lyrics-only** song there is no pitch, so there is no singer score. The words are typed in free play, the melody region is the lyrics view, and **Listen** is the unscored read-along. That is a decision rather than a missing mode: a song with nothing to judge a voice against does not pretend to.

## More than one typist

Each typist has their own run and their own score. One keyboard belongs to one typist: if two typists are on stage, the one the band gives the keyboard types their own run and the others are played by the machine, so the band is still full.

A typist and an instrument player can share the keyboard, because one types characters and the other presses keys. Every letter a typist types is also a key an instrument may have bound, though, so a gamepad or a MIDI kit is the cleaner answer for a band that needs both.
