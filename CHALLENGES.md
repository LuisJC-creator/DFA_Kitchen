# Challenge catalog and source decisions

The supplied practice sheets were read as source material, not as instructions to perform unrelated problems. All retained items define regular languages suitable for state-diagram construction. Either DFA or NFA mode is available for every challenge; a professor-requested NFA exercise starts in NFA mode. The conversion-to-DFA portion of Practice 2 Problem 3 is supported by selecting DFA mode and constructing a deterministic solution; automatic conversion and grading regular-expression text are outside this game.

| # | Challenge | Alphabet | Source |
|---|---|---|---|
| 1 | Ends in 1 | 0,1 | Original |
| 2 | Exactly two 1s | 0,1 | Original |
| 3 | Exactly two 1s and contains 010 | 0,1 | Original user example |
| 4 | Every odd position is 1 | 0,1 | Practice 1 3(a), Practice 2 1(a) |
| 5 | Odd number of 0s OR exactly two 1s | 0,1 | Practice 1 3(b), Practice 2 1(b) |
| 6 | Contains 000 | 0,1 | Practice 1 3(c), Practice 2 1(c) |
| 7 | Ends in 101 | 0,1 | Practice 1 3(d), Practice 2 1(d) |
| 8 | Contains 000 AND ends in 101 | 0,1 | Practice 2 1(e) |
| 9 | Every string except exactly 11101 | 0,1 | Practice 2 1(f) |
| 10 | Exactly two 0s | 0,1 | Practice 2 2(a) |
| 11 | Ends in bbb | a,b | Practice 2 2(b) |
| 12 | Nonempty even binary representations | 0,1 | Practice 2 2(d) |
| 13 | Contains abb | a,b | Practice 2 3(a) |
| 14 | (((aa)*bb) union ab)* | a,b | Practice 2 3(b) |
| 15 | (ab)*a(ba)* | a,b | Practice 2 3(c) |
| 16 | b(aaaaa)*bb union bab | a,b | Practice 2 3(d) |
| 17 | Starts with a and ends with c | a,b,c | Original |
| 18 | No adjacent equal symbols | a,b,c | Original |
| 19 | Contains each of a, b, c | a,b,c | Original |
| 20 | Number of as divisible by 3 | a,b,c | Original |

## Explicit interpretations

- Positions in #4 are one-based. Empty input qualifies vacuously.
- OR in #5 and union in #14/#16 are inclusive.
- #9 excludes only the exact five-symbol word; extensions and empty input are allowed.
- Practice 2 2(a)'s “has two 0s” is interpreted as exactly two, shown in the challenge instructions.
- #12 allows leading zeros, includes the string 0, and excludes empty input because it is not a numeral.
- The exponent stars in #14-16 mean zero or more repetitions, including #14's empty sequence of blocks. #16 includes bbb (zero a-groups) and bab as a separate alternative.
- Zero is divisible by 3 in #20, so strings without a, including empty input, qualify.

## Excluded material

- Practice 1 Problems 1, 2, 4, and 6 concern a board puzzle, a polynomial proof, mappings/functions, and drawing graphs, respectively. They are not finite-automaton language-construction exercises.
- Practice 1 Problem 5 does ask for DFA support for a can-flipping puzzle, but the requested result is bounded reachability and a proof. Turning it into this game's language-recognition format would require an additional move alphabet and reinterpretation, so it was not silently adapted.
- Practice 2 2(c), “starts with aa and ends with any number of bs,” is ambiguous about the allowed middle symbols and whether the intended language is aa b* or a prefix/suffix condition over {a,b,c}. It was omitted rather than assuming the instructor's intent.
- Practice 2 3(e) requests English descriptions of previous languages, so it is not a separate construction challenge.

## Verification

- All binary and two-letter challenges: every string through length 10.
- All three-letter challenges: every string through length 8.
- Total: 72,116 exhaustive language comparisons, plus 10,000 seeded longer strings (500 per challenge, lengths up to 128).
- Every challenge: exact equivalence for a reference DFA and a branching epsilon-NFA with cycles and dead branches; flipping each reachable reference state's acceptance must produce a real counterexample. Short witnesses are checked for minimality by enumeration.
- 150 generated NFAs: all binary-letter strings through length 5 checked by a separate configuration-graph interpreter (9,450 comparisons).
- Targeted tests cover empty input, acceptance before input exhaustion, merging branches, no surviving branches, invalid alphabets/transitions, duplicate labels, resource-limit inconclusiveness, and zoom invariants.
- Browser checks run all 20 challenges in both DFA and NFA modes and exercise NFA-specific editing and playback.
