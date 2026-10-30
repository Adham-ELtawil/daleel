# AtCoder abc300_a — N-choice question

Original C++17 demo code, written for this repo. The seed statement and samples
are in `src/db/seed-fixtures/problems.json`; no problem-page fetch is needed.

The program prints a zero-based position instead of the required one-based index.
On the first sample it prints `1` where `2` is expected. The single-choice sample
also exposes the bug: it prints `0` where `1` is expected.

The recording flow uses locale `en`, with no reported verdict, test number or note,
matching an attempt created by pasting the example code into the app.
